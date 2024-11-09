import { evaluateConditions, extractIndicators, IndicatorsValues, requiredHistory } from "@opentrader/tools";
import { z } from "zod";
import { logger } from "@opentrader/logger";
import { BarSize, XOrderType } from "@opentrader/types";
import {
  useDca,
  cancelSmartTrade,
  IBotConfiguration,
  TBotContext,
  BotTemplate,
  useIndicators,
} from "@opentrader/bot-processor";

export function* dca(ctx: TBotContext<DCABotConfig>) {
  const { config, onStart, onStop } = ctx;
  const { settings } = config;

  if (onStop) {
    yield cancelSmartTrade();
    logger.info(`[DCA] Bot with ${config.symbol} pair stopped`);

    return;
  }

  if (onStart) {
    logger.info(`[DCA] Bot strategy started on ${config.symbol} pair`);

    return;
  }

  const indicators: IndicatorsValues = yield useIndicators(extractIndicators(settings.entry.conditions));
  const shouldEntry = evaluateConditions(settings.entry.conditions, indicators);

  if (shouldEntry) {
    const options = {
      price: settings.entry.price,
      quantity: settings.entry.quantity,
      tpPercent: settings.tp.percent / 100,
      safetyOrders: settings.safetyOrders.map((so) => ({
        relativePrice: -so.priceDeviation / 100,
        quantity: so.quantity,
      })),
    };

    yield useDca(options);

    logger.info(options, `[DCA] Entry executed`);
  }

  logger.info(`[DCA] Strategy executed`);
}

dca.displayName = "DCA Bot";
dca.hidden = true;
dca.schema = z.object({
  entry: z.object({
    quantity: z.number().positive().describe("Quantity of the Entry Order in base currency"),
    type: z.nativeEnum(XOrderType).describe("Entry with Limit or Market order"),
    price: z.number().optional(),
    conditions: z.any().optional(), // @todo schema validation
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

dca.runPolicy = {
  onOrderFilled: true,
  onCandleClosed: true,
} satisfies Template["runPolicy"];

dca.requiredHistory = (({ settings }) => {
  const indicatorsOptions = extractIndicators(settings.entry.conditions);
  return requiredHistory(indicatorsOptions);
}) satisfies Template["requiredHistory"];

dca.timeframe = BarSize.ONE_MINUTE;

dca.watchers = {
  watchCandles: ({ symbol }: IBotConfiguration) => symbol,
};

type Template = BotTemplate<DCABotConfig>;

export type DCABotConfig = IBotConfiguration<z.infer<typeof dca.schema>>;
