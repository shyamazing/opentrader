import { InsufficientFunds } from "ccxt";
import { cargoQueue, QueueObject } from "async";
import { type ExchangeAccountWithCredentials, SmartTradeWithOrders, xprisma } from "@opentrader/db";
import { eventBus } from "@opentrader/event-bus";
import { exchangeProvider, IExchange } from "@opentrader/exchanges";
import { logger } from "@opentrader/logger";
import { SmartTradeExecutor } from "@opentrader/processing";
import { ITicker } from "@opentrader/types";
import { TickerWatcher } from "./channels/ticker/ticker.watcher.js";
import { OrderEvent, OrdersStream } from "./streams/orders.stream.js";

type TradeUpdatedEvent = { type: "onTradeUpdated" };
type TickerEvent = { type: "onTickerChange"; ticker: ITicker };
type ExchangeEvent = OrderEvent | TickerEvent | TradeUpdatedEvent;
type QueueEvent = ExchangeEvent & { smartTrade: SmartTradeWithOrders };

export class Trade {
  exchangeAccount: ExchangeAccountWithCredentials;
  exchange: IExchange;
  queue: QueueObject<QueueEvent>;
  tickerWatcher: TickerWatcher;

  constructor(
    public smartTrade: SmartTradeWithOrders,
    private ordersStream: OrdersStream,
  ) {
    this.exchangeAccount = smartTrade.exchangeAccount as ExchangeAccountWithCredentials; // hacky cast
    this.exchange = exchangeProvider.fromAccount(this.exchangeAccount);

    this.tickerWatcher = new TickerWatcher(this.smartTrade.symbol, this.exchange);

    this.queue = cargoQueue<QueueEvent>(this.queueHandler);
    this.queue.error((err) => {
      if (this.queue.paused) return;

      if (err instanceof InsufficientFunds) {
        logger.warn(`Insufficient funds to place the order: ${err.message}. Retrying in 1 minute...`);
        this.queue.pause();
        setTimeout(() => {
          this.queue.resume();
        }, 60_000);

        return;
      }

      logger.error(err, `[TradeQueue] An error occurred: ${err.message}. Retrying in 1 minute...`);
      this.queue.pause();
      setTimeout(() => {
        this.queue.resume();
      }, 60_000);
    });
  }

  async place() {
    const executor = SmartTradeExecutor.create(this.smartTrade, this.exchangeAccount);
    await executor.next();

    // Init only after the initial order was placed
    this.init();
  }

  async cancel() {
    this.destroy();

    const executor = SmartTradeExecutor.create(this.smartTrade, this.exchangeAccount);
    await executor.cancelOrders();
  }

  init() {
    this.ordersStream.on("order", this.handleOrderEvent);
    this.tickerWatcher.on("ticker", this.handleTickerEvent);
    this.tickerWatcher.enable();
  }

  destroy() {
    this.ordersStream.off("order", this.handleOrderEvent);
    this.tickerWatcher.off("ticker", this.handleTickerEvent);
    this.tickerWatcher.disable();
    this.queue.kill();
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
      this.destroy();
      await eventBus.emit("onTradeCompleted", executor.smartTrade);
    }
  };

  handleOrderEvent = async (event: OrderEvent) => {
    if (event.order.smartTrade.id !== this.smartTrade.id) {
      return; // ignore others smart trades
    }

    void this.queue.push({ ...event, smartTrade: this.smartTrade });
  };

  handleTickerEvent = async (ticker: ITicker) => {
    void this.queue.push({ type: "onTickerChange", ticker, smartTrade: this.smartTrade });
  };

  private async pull() {
    this.smartTrade = await xprisma.smartTrade.findUniqueOrThrow({
      where: { id: this.smartTrade.id },
      include: { orders: true, exchangeAccount: true },
    });

    return this.smartTrade;
  }
}
