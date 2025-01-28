import { cargoQueue, QueueObject } from "async";
import { store } from "@opentrader/bot-store";
import { findStrategy } from "@opentrader/bot-templates/server";
import { eventBus } from "@opentrader/event-bus";
import { SmartTradeWithOrders, TBotWithExchangeAccount, xprisma } from "@opentrader/db";
import { logger } from "@opentrader/logger";
import { BotProcessing, getWatchers, shouldRunStrategy } from "@opentrader/processing";
import { MarketEvent, MarketId, MarketEventType } from "@opentrader/types";
import { MarketsStream } from "./streams/markets.stream.js";
import { OrderEvent, OrdersStream } from "./streams/orders.stream.js";

type OrderFilledEvent = {
  type: typeof MarketEventType.onOrderFilled;
  marketId: MarketId;
  orderId: number;
};

type TradeCompletedEvent = {
  type: "onTradeCompleted";
  marketId: MarketId;
  tradeId: number;
};

type ProcessingEvent = MarketEvent | OrderFilledEvent | TradeCompletedEvent;
export type QueueEvent = ProcessingEvent & { bot: TBotWithExchangeAccount; subscribedMarkets: MarketId[] };

export class Bot {
  strategy: ReturnType<typeof findStrategy>;
  queue: QueueObject<QueueEvent>;
  stopped = false;

  constructor(
    public bot: TBotWithExchangeAccount,
    private ordersStream: OrdersStream,
    private marketsStream: MarketsStream,
  ) {
    this.strategy = findStrategy(this.bot.template);
    this.queue = cargoQueue<QueueEvent>(this.queueHandler);
    this.queue.error((error) => {
      if (this.queue.paused) return;

      logger.error(error, `[BotQueue] An error occurred: ${error.message}. Retrying in 1 minute...`);
      this.queue.pause();
      setTimeout(() => {
        if (!this.stopped) {
          this.queue.resume();
        }
      }, 60_000);
    });
  }

  private handleOrderEvent = (event: OrderEvent) => {
    if (event.order.smartTrade.botId !== this.bot.id) return;

    this.strategyDecisionMaker(event);
  };
  private handleMarketEvent = (event: MarketEvent) => {
    const { strategyFn } = this.strategy;
    const { watchOrderbook, watchCandles, watchTrades, watchTicker } = getWatchers(strategyFn, this.bot);
    const isWatchingOrderbook = event.type === "onOrderbookChange" && watchOrderbook.includes(event.marketId);
    const isWatchingTicker = event.type === "onTickerChange" && watchTicker.includes(event.marketId);
    const isWatchingTrades = event.type === "onPublicTrade" && watchTrades.includes(event.marketId);
    const isWatchingCandles = event.type === "onCandleClosed" && watchCandles.includes(event.marketId);
    const isWatchingAny = isWatchingOrderbook || isWatchingTicker || isWatchingTrades || isWatchingCandles;

    if (isWatchingAny) {
      this.strategyDecisionMaker(event);
    }
  };
  private handleTradeCompletedEvent = (trade: SmartTradeWithOrders) => {
    if (trade.botId !== this.bot.id) return;

    this.strategyDecisionMaker(trade);
  };

  private strategyDecisionMaker = (event: OrderEvent | MarketEvent | SmartTradeWithOrders) => {
    const { strategyFn } = this.strategy;
    const { watchOrderbook, watchCandles, watchTrades, watchTicker } = getWatchers(strategyFn, this.bot);
    const subscribedMarkets = [
      ...new Set([...watchOrderbook, ...watchCandles, ...watchTrades, ...watchTicker]),
    ] as MarketId[];

    let queueEvent: QueueEvent | undefined;
    if ("order" in event) {
      // @todo isOrderEvent guard
      const { order, exchangeCode } = event;
      const marketId = `${exchangeCode}:${order.smartTrade.symbol}` as MarketId;

      switch (event.type) {
        case "onFilled":
          queueEvent = {
            type: "onOrderFilled",
            marketId,
            bot: this.bot,
            orderId: order.id,
            subscribedMarkets,
          };
      }
    } else if ("orders" in event) {
      // @todo isTradeEvent guard
      const trade = event;
      const { exchangeAccount } = trade;
      const marketId = `${exchangeAccount.exchangeCode}:${trade.symbol}` as MarketId;

      queueEvent = { type: "onTradeCompleted", tradeId: trade.id, marketId, bot: this.bot, subscribedMarkets };
    } else {
      // @todo isMarketEvent guard
      queueEvent = {
        ...event,
        bot: this.bot,
        subscribedMarkets,
      };
    }

    if (queueEvent && shouldRunStrategy(strategyFn, this.bot, queueEvent.type)) {
      void this.queue.push(queueEvent);
    }
  };

  private queueHandler = async (tasks: QueueEvent[]) => {
    const event = tasks[tasks.length - 1]; // getting last task from the queue

    if (tasks.length > 1) {
      logger.debug(`📠 Batching ${tasks.length} tasks of bot [id: ${event.bot.id} name: ${event.bot.name}]`);
    } else {
      logger.debug(`📠 Processing ${tasks.length} task of bot [id: ${event.bot.id} name: ${event.bot.name}]`);
    }

    const botProcessor = new BotProcessing(event.bot);

    await botProcessor.process({
      triggerEventType: event.type,
      market: store.getMarket(event.marketId),
      markets: store.getMarkets(event.subscribedMarkets),
    });

    const pendingSmartTrades = await botProcessor.getPendingSmartTrades();
    for (const trade of pendingSmartTrades) {
      await eventBus.emit("placeTrade", trade);
    }
  };

  async start() {
    await eventBus.emit("onBeforeBotStarted", this.bot);

    // 1. Exec "start" on the strategy fn
    const botProcessor = new BotProcessing(this.bot);
    await botProcessor.processStartCommand();

    this.bot = await xprisma.bot.custom.update({
      where: { id: this.bot.id },
      data: { enabled: true },
      include: { exchangeAccount: true },
    });

    // 2. Place pending trades
    const pendingSmartTrades = await botProcessor.getPendingSmartTrades();
    for (const trade of pendingSmartTrades) {
      await eventBus.emit("placeTrade", trade);
    }

    // 3. Subscribe to Market and Order events
    await this.marketsStream.add(this.bot);
    this.ordersStream.on("order", this.handleOrderEvent);
    this.marketsStream.on("market", this.handleMarketEvent);
    eventBus.on("onTradeCompleted", this.handleTradeCompletedEvent);

    await eventBus.emit("onBotStarted", this.bot);
  }

  async stop() {
    await eventBus.emit("onBeforeBotStopped", this.bot);

    // Unsubscribe from Market and Order channels
    this.ordersStream.off("order", this.handleOrderEvent);
    this.marketsStream.off("market", this.handleMarketEvent);
    eventBus.off("onTradeCompleted", this.handleTradeCompletedEvent);
    this.queue.kill();
    this.stopped = true;

    // Mark the bot as disabled
    this.bot = await xprisma.bot.custom.update({
      where: { id: this.bot.id },
      data: { enabled: false, processing: false },
      include: { exchangeAccount: true },
    });

    // Exec "stop" on the strategy fn
    const botProcessor = new BotProcessing(this.bot);
    await botProcessor.processStopCommand();

    await eventBus.emit("onBotStopped", this.bot);
  }
}
