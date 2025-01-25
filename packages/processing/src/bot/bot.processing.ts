import type { BotState, IBotConfiguration } from "@opentrader/bot-processor";
import { createStrategyRunner } from "@opentrader/bot-processor";
import { findStrategy } from "@opentrader/bot-templates/server";
import { exchangeProvider } from "@opentrader/exchanges";
import type { TBotWithExchangeAccount } from "@opentrader/db";
import { xprisma } from "@opentrader/db";
import { logger } from "@opentrader/logger";
import type { ExchangeCode, MarketData, MarketId, MarketEventType } from "@opentrader/types";
import { SmartTradeExecutor } from "../executors/index.js";
import { BotStoreAdapter } from "./bot-store-adapter.js";

type ProcessParams = {
  triggerEventType?: MarketEventType;
  market?: MarketData; // default market
  markets?: Record<MarketId, MarketData>; // additional markets
};

export class BotProcessing {
  constructor(private bot: TBotWithExchangeAccount) {}

  static async fromId(id: number) {
    const bot = await xprisma.bot.custom.findUniqueOrThrow({
      where: { id },
      include: { exchangeAccount: true },
    });

    return new BotProcessing(bot);
  }

  static async fromSmartTradeId(smartTradeId: number) {
    const bot = await xprisma.bot.custom.findFirstOrThrow({
      where: {
        smartTrades: {
          some: { id: smartTradeId },
        },
      },
      include: { exchangeAccount: true },
    });

    return new BotProcessing(bot);
  }

  private async start() {
    this.bot = await xprisma.bot.custom.update({
      where: { id: this.bot.id },
      data: { enabled: true },
      include: { exchangeAccount: true },
    });
  }

  private async stop() {
    this.bot = await xprisma.bot.custom.update({
      where: { id: this.bot.id },
      data: { enabled: false },
      include: { exchangeAccount: true },
    });
  }

  private async processCommand(command: "start" | "stop" | "process", params: ProcessParams) {
    const { triggerEventType, market, markets } = params;

    logger.debug(
      {
        context: `candle=${JSON.stringify(market?.candle)} candlesHistory=${market?.candles.length || 0} trade=${JSON.stringify(market?.trade)}`,
        bot: `id=${this.bot.id} name="${this.bot.name}"`,
      },
      `🤖 Exec "${command}" command`,
    );
    const t0 = Date.now();

    if (this.isBotProcessing()) {
      console.warn(`Cannot execute "${command}()" command. The bot is busy right now by the previous processing job.`);
      return;
    }

    const processor = await this.getProcessor();
    const botState = this.bot.state as BotState;

    await xprisma.bot.setProcessing(true, this.bot.id);
    try {
      if (command === "start") {
        await processor.start(botState);
      } else if (command === "stop") {
        await processor.stop(botState);
      } else if (command === "process") {
        await processor.process(botState, triggerEventType, market, markets);
      }
    } catch (err) {
      await xprisma.bot.setProcessing(false, this.bot.id);
      await xprisma.botLog.log({
        startedAt: new Date(t0),
        endedAt: new Date(),
        botId: this.bot.id,
        context: market,
        action: command,
        triggerEventType,
        error: {
          message: (err as Error).message,
          stack: (err as Error).stack,
        },
      });

      throw err;
    }

    await xprisma.bot.setProcessing(false, this.bot.id);
    await xprisma.bot.updateState(botState, this.bot.id);

    if (this.bot.logging) {
      await xprisma.botLog.log({
        startedAt: new Date(t0),
        endedAt: new Date(),
        botId: this.bot.id,
        context: market,
        action: command,
        triggerEventType,
      });
    }

    const t1 = Date.now();
    const duration = (t1 - t0) / 1000;

    logger.debug(
      {
        botId: this.bot.id,
        botName: this.bot.name,
      },
      `🤖 Exec "${command}" command finished in ${duration}s`,
    );
  }

  async processStartCommand() {
    await this.processCommand("start", {});
  }

  async processStopCommand() {
    await this.processCommand("stop", {});
  }

  async process(params: ProcessParams = {}) {
    await this.processCommand("process", params);
  }

  isBotRunning() {
    return this.bot.enabled;
  }

  isBotStopped() {
    return !this.bot.enabled;
  }

  isBotProcessing() {
    return this.bot.processing;
  }

  getBot() {
    return this.bot;
  }

  getId() {
    return this.bot.id;
  }

  getTimeframe() {
    return this.bot.timeframe;
  }

  private async getProcessor() {
    const exchangeAccount = await xprisma.exchangeAccount.findUniqueOrThrow({
      where: {
        id: this.bot.exchangeAccountId,
      },
    });

    const additionalExchangeAccounts = await xprisma.exchangeAccount.findMany({
      where: {
        bots: {
          some: { id: this.bot.id },
        },
      },
    });

    const exchange = exchangeProvider.fromAccount(exchangeAccount);
    const additionalExchanges = additionalExchangeAccounts.map((exchangeAccount) =>
      exchangeProvider.fromAccount(exchangeAccount),
    );

    const configuration: IBotConfiguration = {
      id: this.bot.id,
      symbol: this.bot.symbol,
      settings: this.bot.settings,
      exchangeCode: exchangeAccount.exchangeCode as ExchangeCode,
    };

    const storeAdapter = new BotStoreAdapter(() => this.stop());
    const { strategyFn } = findStrategy(this.bot.template);

    const processor = createStrategyRunner({
      store: storeAdapter,
      exchange,
      additionalExchanges,
      botConfig: configuration,
      botTemplate: strategyFn,
    });

    return processor;
  }

  async placePendingOrders() {
    const smartTrades = await xprisma.smartTrade.findMany({
      where: {
        ref: { not: null },
        bot: { id: this.bot.id },
      },
      include: {
        exchangeAccount: true,
        orders: true,
      },
    });

    logger.debug(`BotProcessing: Found ${smartTrades.length} pending orders for placement`);

    for (const smartTrade of smartTrades) {
      const { exchangeAccount } = smartTrade;

      logger.debug(
        `Executed next() for SmartTrade { id: ${smartTrade.id}, symbol: ${smartTrade.symbol}, exchangeCode: ${exchangeAccount.exchangeCode} }`,
      );

      const smartTradeExecutor = SmartTradeExecutor.create(smartTrade, exchangeAccount);
      await smartTradeExecutor.next();
    }
  }

  async getPendingSmartTrades() {
    const smartTrades = await xprisma.smartTrade.findMany({
      where: {
        ref: { not: null },
        bot: { id: this.bot.id },
      },
      include: {
        exchangeAccount: true,
        orders: true,
      },
    });

    return smartTrades;
  }
}
