import { XEntityType, XOrderSide, XOrderStatus, XOrderType } from "@opentrader/types";

export type Order = {
  id: number;
  status: XOrderStatus;
  type: XOrderType;
  entityType: XEntityType;
  side: XOrderSide;
  price?: number;
  stopPrice?: number;
  relativePrice?: number;
  filledPrice?: number;
  fee?: number;
  symbol: string;
  exchangeAccountId: number;
  exchangeOrderId?: string;
  quantity: number;

  createdAt: Date;
  updatedAt: Date;
  placedAt?: Date;
  syncedAt?: Date;
  filledAt?: Date;
};
