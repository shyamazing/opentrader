import { eventBus } from "@opentrader/event-bus";
import { logger } from "@opentrader/logger";
import { findStrategy } from "@opentrader/bot-templates/server";
import { BotProcessing, getWatchers, shouldRunStrategy } from "@opentrader/processing";
import { MarketEvent, MarketId } from "@opentrader/types";
import { TBotWithExchangeAccount, xprisma } from "@opentrader/db";

import { processingQueue } from "./queue/index.js";
import { MarketsStream } from "./streams/markets.stream.js";
import { OrderEvent, OrdersStream } from "./streams/orders.stream.js";

export class Bot {
  constructor(
    public bot: TBotWithExchangeAccount,
    private marketsStream: MarketsStream,
    private ordersStream: OrdersStream,
  ) {}

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
      await eventBus.emit("onTradeCreated", trade);
    }

    // 3. Subscribe to Market and Order events
    await this.watchStreams();

    await eventBus.emit("onBotStarted", this.bot);
  }

  async stop() {
    await eventBus.emit("onBeforeBotStopped", this.bot);

    // 1. Unsubscribe from Market and Order events
    this.unwatchStreams();

    // 2. Exec "stop" on the strategy fn
    const botProcessor = new BotProcessing(this.bot);
    await botProcessor.processStopCommand();

    this.bot = await xprisma.bot.custom.update({
      where: { id: this.bot.id },
      data: { enabled: false },
      include: { exchangeAccount: true },
    });

    await eventBus.emit("onBotStopped", this.bot);
  }

  async watchStreams() {
    await this.marketsStream.add(this.bot);
    this.marketsStream.on("market", this.handleMarketEvent);
    this.ordersStream.on("order", this.handleOrderEvent);
  }

  unwatchStreams() {
    this.marketsStream.off("market", this.handleMarketEvent);
    this.ordersStream.off("order", this.handleOrderEvent);
  }

  handleMarketEvent = (event: MarketEvent) => {
    const { strategyFn } = findStrategy(this.bot.template);
    const { watchOrderbook, watchCandles, watchTrades, watchTicker } = getWatchers(strategyFn, this.bot);

    const isWatchingOrderbook = event.type === "onOrderbookChange" && watchOrderbook.includes(event.marketId);
    const isWatchingTicker = event.type === "onTickerChange" && watchTicker.includes(event.marketId);
    const isWatchingTrades = event.type === "onPublicTrade" && watchTrades.includes(event.marketId);
    const isWatchingCandles = event.type === "onCandleClosed" && watchCandles.includes(event.marketId);
    const isWatchingAny = isWatchingOrderbook || isWatchingTicker || isWatchingTrades || isWatchingCandles;

    const subscribedMarkets = [
      ...new Set([...watchOrderbook, ...watchCandles, ...watchTrades, ...watchTicker]),
    ] as MarketId[];

    if (isWatchingAny && shouldRunStrategy(strategyFn, this.bot, event.type)) {
      processingQueue.push({
        ...event,
        bot: this.bot,
        subscribedMarkets,
      });
    }
  };

  handleOrderEvent = (event: OrderEvent) => {
    const { order, exchangeCode } = event;

    if (order.smartTrade.botId !== this.bot.id) {
      logger.debug("handleOrderEvent: Order does not belong to this bot. Ignoring");
      return;
    }

    if (event.type === "onFilled") {
      if (!this.bot.enabled) {
        logger.error("handleOrderEvent: Cannot handle order event when the bot is disabled");
        return;
      }

      const marketId = `${exchangeCode}:${order.smartTrade.symbol}` as MarketId;
      const { strategyFn } = findStrategy(this.bot.template);
      const { watchOrderbook, watchCandles, watchTrades, watchTicker } = getWatchers(strategyFn, this.bot);
      const subscribedMarkets = [
        ...new Set([...watchOrderbook, ...watchCandles, ...watchTrades, ...watchTicker]),
      ] as MarketId[];

      if (shouldRunStrategy(strategyFn, this.bot, "onOrderFilled")) {
        processingQueue.push({
          type: "onOrderFilled",
          marketId,
          bot: this.bot,
          orderId: order.id,
          subscribedMarkets,
        });
      }
    }
  };
}
