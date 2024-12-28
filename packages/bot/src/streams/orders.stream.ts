import { EventEmitter } from "node:events";
import type { ExchangeCode, IWatchOrder } from "@opentrader/types";
import type { OrderWithSmartTrade, ExchangeAccountWithCredentials } from "@opentrader/db";
import { xprisma } from "@opentrader/db";
import { logger } from "@opentrader/logger";
import { decomposeSymbol } from "@opentrader/tools";
import { OrdersChannel, OrderEventType } from "../channels/index.js";

export type OrderEvent = {
  type: OrderEventType;
  exchangeOrder: IWatchOrder;
  order: OrderWithSmartTrade;
  exchangeCode: ExchangeCode;
};

/**
 * Emits:
 * - order: OrderEvent
 */
export class OrdersStream extends EventEmitter {
  private channels: OrdersChannel[] = [];
  private initialExchangeAccounts: ExchangeAccountWithCredentials[];

  constructor(exchangeAccounts: ExchangeAccountWithCredentials[]) {
    super();
    this.initialExchangeAccounts = exchangeAccounts;
  }

  async create() {
    for (const exchangeAccount of this.initialExchangeAccounts) {
      await this.addExchangeAccount(exchangeAccount);
    }
  }

  async addExchangeAccount(exchangeAccount: ExchangeAccountWithCredentials) {
    const watcherExists = this.channels.find((channel) => channel.exchangeAccount.id === exchangeAccount.id);
    if (watcherExists) {
      logger.warn(`⚠️ Already watching exchange account with ID ${exchangeAccount.id}.`);
      return;
    }

    const ordersWatcher = new OrdersChannel(exchangeAccount);
    this.channels.push(ordersWatcher);

    ordersWatcher.subscribe("onFilled", this.onOrderFilled.bind(this));
    ordersWatcher.subscribe("onCanceled", this.onOrderCanceled.bind(this));
    ordersWatcher.subscribe("onPlaced", this.onOrderPlaced.bind(this));

    await ordersWatcher.enable();

    logger.debug(
      `${exchangeAccount.exchangeCode} exchange account with ID ${exchangeAccount.id} subscribed to OrdersWatcher`,
    );
  }

  async removeExchangeAccount(exchangeAccount: ExchangeAccountWithCredentials) {
    const ordersChannel = this.channels.find((watcher) => watcher.exchangeAccount.id === exchangeAccount.id);

    if (!ordersChannel) {
      logger.error(`❗ Exchange account #${exchangeAccount.id} not found in the ordersWatchers`);
      return;
    }

    ordersChannel.unsubscribeAll();
    await ordersChannel.disable();

    // exclude the watcher from the list
    this.channels = this.channels.filter((channel) => channel.exchangeAccount.id !== exchangeAccount.id);

    logger.debug(`🗑️ Exchange account #${exchangeAccount.id} removed from the ordersWatchers`);
  }

  async updateExchangeAccount(exchangeAccount: ExchangeAccountWithCredentials) {
    await this.removeExchangeAccount(exchangeAccount);
    await this.addExchangeAccount(exchangeAccount);
  }

  async destroy() {
    for (const watcher of this.channels) {
      watcher.unsubscribeAll();
      await watcher.disable();
    }
  }

  private async onOrderFilled(exchangeOrder: IWatchOrder, order: OrderWithSmartTrade, exchangeCode: ExchangeCode) {
    logger.info(
      `🔋 [${exchangeCode}] onOrderFilled: Order #${order.id}: ${order.exchangeOrderId} was filled with price ${exchangeOrder.filledPrice} at ${exchangeOrder.lastTradeTimestamp} timestamp`,
    );
    const updatedOrder = await xprisma.order.updateStatusToFilled({
      orderId: order.id,
      filledPrice: exchangeOrder.filledPrice,
      filledAt: new Date(exchangeOrder.lastTradeTimestamp || Date.now()),
      fee: exchangeOrder.fee,
    });

    this.emit("order", {
      type: "onFilled",
      exchangeOrder,
      order: updatedOrder,
      exchangeCode,
    } satisfies OrderEvent);
  }

  private async onOrderCanceled(exchangeOrder: IWatchOrder, order: OrderWithSmartTrade, exchangeCode: ExchangeCode) {
    // Edge case: the user may cancel the order manually on the exchange
    const updatedOrder = await xprisma.order.updateStatus("Canceled", order.id);
    logger.info(`❌  onOrderCanceled: Order #${order.id}: ${order.exchangeOrderId} was canceled`);

    this.emit("order", {
      type: "onCanceled",
      exchangeOrder,
      order: updatedOrder,
      exchangeCode,
    } satisfies OrderEvent);
  }

  private async onOrderPlaced(exchangeOrder: IWatchOrder, order: OrderWithSmartTrade, exchangeCode: ExchangeCode) {
    // Edge case: the user could change the price of the order on the Exchange
    const { quoteCurrency } = decomposeSymbol(order.symbol);
    logger.info(
      `⬆️  onOrderPlaced: Placed ${order.symbol} order at ${exchangeOrder.price} ${quoteCurrency} (id: ${order.id}, eid: ${order.exchangeOrderId})`,
    );

    this.emit("order", {
      type: "onPlaced",
      exchangeOrder,
      order,
      exchangeCode,
    } satisfies OrderEvent);

    // Order was possibly replaced.
    // This means that the user changed the order price on the Exchange.
    // Or the actual order price after placement differs from the placed price.
    // It may happen if the Exchange striped some decimal points of the price.
    //
    // Important: If order is filled immediately after
    // changing the price, the Exchange will not notify
    // about this (Placed and Filled statuses).
    // The order will remain with status "open",
    // until it's status will be updated by REST API fallback.
    //
    // This behaviour is observed on the OKX exchange

    // It may be a mistake to compare the exact value
    // Maybe will be better to store the `placedPrice` in the db
    // and compare `exchangeOrder.price !== order.placedPrice;`
    const orderPriceChanged = exchangeOrder.price !== order.price;
    if (orderPriceChanged) {
      logger.warn(
        `    ⚠️ Price changed ${order.price} -> ${exchangeOrder.price}. User may changed the order price on the Exchange.`,
      );
    }
  }
}
