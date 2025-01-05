import { ExchangeClosedByUser, NetworkError, RequestTimeout } from "ccxt";
import { cargoQueue, QueueObject } from "async";
import { findStrategy } from "@opentrader/bot-templates/server";
import { type ExchangeAccountWithCredentials, SmartTradeWithOrders, xprisma } from "@opentrader/db";
import { eventBus } from "@opentrader/event-bus";
import { exchangeProvider } from "@opentrader/exchanges";
import { logger } from "@opentrader/logger";
import { getWatchers, shouldRunStrategy, SmartTradeExecutor } from "@opentrader/processing";
import { ITicker, MarketId } from "@opentrader/types";
import { processingQueue } from "./queue/index.js";
import { OrderEvent, OrdersStream } from "./streams/orders.stream.js";

type TradeUpdatedEvent = { type: "onTradeUpdated" };
type TickerEvent = { type: "onTickerChange"; ticker: ITicker };
type ExchangeEvent = OrderEvent | TickerEvent | TradeUpdatedEvent;
type QueueEvent = ExchangeEvent & { smartTrade: SmartTradeWithOrders };

export class TradeManager {
  exchangeAccount: ExchangeAccountWithCredentials;

  queue: QueueObject<QueueEvent>;
  watchTicker = false;

  constructor(
    public smartTrade: SmartTradeWithOrders,
    private ordersStream: OrdersStream,
  ) {
    this.exchangeAccount = smartTrade.exchangeAccount as ExchangeAccountWithCredentials;

    this.queue = cargoQueue<QueueEvent>(this.queueHandler);
    this.queue.error((error) => {
      logger.error(error, `An error occurred in the trades queue: ${error.message}`);
    });

    void this.init();
  }

  private async init() {
    this.ordersStream.on("order", this.handleOrderEvent);

    const exchange = exchangeProvider.fromAccount(this.exchangeAccount);

    this.watchTicker = true;
    while (this.watchTicker) {
      try {
        const ticker = await exchange.watchTicker(this.smartTrade.symbol);

        // check if not already canceled
        if (this.watchTicker) {
          void this.queue.push({ type: "onTickerChange", ticker, smartTrade: this.smartTrade });
        }
      } catch (err) {
        if (err instanceof NetworkError) {
          logger.warn(
            `[TradeManager] NetworkError occurred on ${this.exchangeAccount.exchangeCode}:${this.smartTrade.symbol}. Error: ${err.message}. Reconnecting in 3s...`,
          );
          await new Promise((resolve) => setTimeout(resolve, 3000)); // prevents infinite cycle
        } else if (err instanceof RequestTimeout) {
          logger.warn(
            err,
            `[TradeManager] RequestTimeout occurred on ${this.exchangeAccount.exchangeCode}:${this.smartTrade.symbol}.`,
          );
        } else if (err instanceof ExchangeClosedByUser) {
          logger.info("[TradeManager] ExchangeClosedByUser");
          break;
        } else {
          logger.error(
            err,
            `[TradeManager] Unhandled error occurred on ${this.exchangeAccount.exchangeCode}:${this.smartTrade.symbol}. Watcher stopped.`,
          );
          this.watchTicker = false;
          break;
        }
      }
    }
  }

  unwatchStreams() {
    this.ordersStream.off("order", this.handleOrderEvent);
    this.watchTicker = false;
    this.queue.kill();
  }

  get id() {
    return this.smartTrade.id;
  }

  async next() {
    await this.queue.push({ type: "onTradeUpdated", smartTrade: this.smartTrade });
  }

  queueHandler = async (tasks: QueueEvent[]) => {
    const event = tasks[tasks.length - 1]; // getting last task from the queue

    this.smartTrade = await this.pull();

    const executor = SmartTradeExecutor.create(this.smartTrade, this.exchangeAccount);

    switch (event.type) {
      case "onFilled":
        await executor.onOrderFilled?.(event.order);
        break;
      case "onTickerChange":
        await executor.onTicker?.(event.ticker);
        break;
      case "onTradeUpdated":
        await executor.next();
        break;
    }

    if (executor.status === "Finished") {
      this.unwatchStreams();
      await eventBus.emit("onTradeCompleted", executor.smartTrade);
      await this.runStrategy();
    }
  };

  handleOrderEvent = async (event: OrderEvent) => {
    if (event.order.smartTrade.id !== this.smartTrade.id) {
      return; // ignore others smart trades
    }

    void this.queue.push({ ...event, smartTrade: this.smartTrade });
  };

  private async runStrategy() {
    if (!this.smartTrade.botId) {
      logger.warn(`onTradeCompleted: Trade with ${this.smartTrade.id} not attached to any bot`);
      return;
    }

    const bot = await xprisma.bot.custom.findUniqueOrThrow({
      where: { id: this.smartTrade.botId },
      include: { exchangeAccount: true },
    });
    const { exchangeAccount } = this.smartTrade;

    const marketId = `${exchangeAccount.exchangeCode}:${this.smartTrade.symbol}` as MarketId;
    const { strategyFn } = findStrategy(bot.template);
    const { watchOrderbook, watchCandles, watchTrades, watchTicker } = getWatchers(strategyFn, bot);
    const subscribedMarkets = [
      ...new Set([...watchOrderbook, ...watchCandles, ...watchTrades, ...watchTicker]),
    ] as MarketId[];

    if (shouldRunStrategy(strategyFn, bot, "onTradeCompleted")) {
      processingQueue.push({
        type: "onTradeCompleted",
        tradeId: this.smartTrade.id,
        marketId,
        bot,
        subscribedMarkets,
      });
    }
  }

  private async pull() {
    this.smartTrade = await xprisma.smartTrade.findUniqueOrThrow({
      where: { id: this.smartTrade.id },
      include: { orders: true, exchangeAccount: true },
    });

    return this.smartTrade;
  }
}
