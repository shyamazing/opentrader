import { z } from "zod";
import { zt } from "@opentrader/prisma";

import { XOrderType } from "@opentrader/types";
import { ZBotState } from "../bot/bot-state.schema.js";

// Keep `ZDcaBotSettings` in sync with `dca.schema` from @opentrader/bot-templates
export const ZDcaBotSettings = z.object({
  entry: z.object({
    quantity: z.number().positive().describe("Quantity of the Entry Order in base currency"),
    type: z.nativeEnum(XOrderType).describe("Entry with Limit or Market order"),
    price: z.number().optional(),
    conditions: z.any().optional(),
  }),
  tp: z.object({
    percent: z.number().positive().describe("Take Profit from entry order price in %"),
  }),
  safetyOrders: z.array(
    z.object({
      quantity: z.number().positive().positive("Quantity of the Safety Order in base currency"),
      priceDeviation: z.number().positive().positive("Price deviation from the Entry Order price in %"),
    }),
  ),
});

export const ZDcaBot = zt.BotSchema.extend({
  settings: ZDcaBotSettings,
  state: ZBotState,
});

export type TDcaBot = z.infer<typeof ZDcaBot>;
export type TDcaBotSettings = z.infer<typeof ZDcaBotSettings>;
