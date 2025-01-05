import { CreateSmartTradePayload } from "@opentrader/bot-processor";
import type { Prisma, TBot } from "@opentrader/db";
import { XEntityType, XOrderSide } from "@opentrader/types";
import { toPrismaOrder } from "./toPrismaOrder.js";

export function toPrismaSmartTrade(
  smartTrade: CreateSmartTradePayload,
  bot: Pick<TBot, "id" | "symbol" | "exchangeAccountId" | "ownerId">,
  ref: string,
): Prisma.SmartTradeCreateInput {
  const { buy, sell, sl, quantity } = smartTrade;

  const buyExchangeAccountId = buy.exchange || bot.exchangeAccountId;
  const buySymbol = buy.symbol || bot.symbol;
  const buyOrderData = toPrismaOrder(
    buy,
    quantity,
    XOrderSide.Buy,
    XEntityType.EntryOrder,
    buyExchangeAccountId,
    buySymbol,
  );

  const sellExchangeAccountId = sell?.exchange || bot.exchangeAccountId;
  const sellSymbol = sell?.symbol || bot.symbol;
  const sellOrderData = sell
    ? toPrismaOrder(sell, quantity, XOrderSide.Sell, XEntityType.TakeProfitOrder, sellExchangeAccountId, sellSymbol)
    : undefined;

  const stopLossOrderData = sl
    ? toPrismaOrder(sl, quantity, XOrderSide.Sell, XEntityType.StopLossOrder, sellExchangeAccountId, sellSymbol)
    : undefined;

  const additionalOrders =
    smartTrade.additionalOrders?.map((order) =>
      toPrismaOrder(
        order,
        order.quantity,
        order.side,
        order.entityType,
        order.exchange || bot.exchangeAccountId,
        order.symbol || bot.symbol,
      ),
    ) || [];

  return {
    entryType: "Order",
    takeProfitType: sell ? "Order" : "None",

    ref,
    type: smartTrade.type,
    symbol: buySymbol,

    orders: {
      createMany: {
        data: [buyOrderData, sellOrderData, stopLossOrderData, ...additionalOrders].filter((order) => !!order),
      },
    },

    exchangeAccount: {
      connect: {
        id: buyExchangeAccountId,
      },
    },
    owner: {
      connect: {
        id: bot.ownerId,
      },
    },
    bot: {
      connect: {
        id: bot.id,
      },
    },
  };
}
