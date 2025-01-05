import type { TBotWithExchangeAccount } from "@opentrader/db";
import { MarketEvent, MarketId, MarketEventType } from "@opentrader/types";

export type OrderFilledEvent = {
  type: typeof MarketEventType.onOrderFilled;
  marketId: MarketId;
  orderId: number;
};

export type TradeCompletedEvent = {
  type: "onTradeCompleted";
  marketId: MarketId;
  tradeId: number;
};

export type ProcessingEvent = MarketEvent | OrderFilledEvent | TradeCompletedEvent;

export type QueueEvent = ProcessingEvent & { bot: TBotWithExchangeAccount; subscribedMarkets: MarketId[] };
