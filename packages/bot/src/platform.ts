import { findStrategy, loadCustomStrategies } from "@opentrader/bot-templates/server";
import {
  xprisma,
  type ExchangeAccountWithCredentials,
  TBotWithExchangeAccount,
  SmartTradeWithOrders,
} from "@opentrader/db";
import { logger } from "@opentrader/logger";
import { exchangeProvider } from "@opentrader/exchanges";
import { BotProcessing } from "@opentrader/processing";
import { eventBus } from "@opentrader/event-bus";
import { store } from "@opentrader/bot-store";
import { MarketEvent } from "@opentrader/types";
import { EventEmitter } from "node:events";
import { Bot } from "./bot.manager.js";

import { MarketsStream } from "./streams/markets.stream.js";
import { OrderEvent, OrdersStream } from "./streams/orders.stream.js";
import { TradeManager } from "./trade.manager.js";

export class Platform {
  private ordersStream: OrdersStream;
  private marketStream: MarketsStream;
  private unsubscribeFromEventBus = () => {};
  private enabledBots: Bot[] = [];
  private trades: TradeManager[] = [];

  constructor(exchangeAccounts: ExchangeAccountWithCredentials[]) {
    EventEmitter.defaultMaxListeners = 0; // Disable Node.js max listeners warning

    this.ordersStream = new OrdersStream(exchangeAccounts);
    this.ordersStream.on("order", this.handleOrderEvent);

    this.marketStream = new MarketsStream(this.enabledBots.map(({ bot }) => bot));
    this.marketStream.on("market", this.handleMarketEvent);
  }

  async bootstrap() {
    const customStrategiesPath = process.env.CUSTOM_STRATEGIES_PATH;
    if (customStrategiesPath) await this.loadCustomStrategies(customStrategiesPath);

    await this.cleanOrphanedBots();
    await this.ordersStream.create();
    await this.marketStream.create();

    this.unsubscribeFromEventBus = this.subscribeToEventBus();
  }

  async shutdown() {
    await this.stopEnabledBots();

    await this.ordersStream.destroy();

    this.marketStream.off("market", this.handleMarketEvent);
    this.marketStream.destroy();

    this.unsubscribeFromEventBus();
  }

  /**
   * Stops enabled bots gracefully.
   * Does execute "stop" command on each bot, and then sets the bot status as disabled.
   */
  async stopEnabledBots() {
    const bots = await xprisma.bot.custom.findMany({
      where: { OR: [{ enabled: true }, { processing: true }] },
      include: { exchangeAccount: true },
    });
    if (bots.length === 0) return;
    logger.info(`[Processor] Stopping ${bots.length} bots gracefully…`);

    for (let bot of bots) {
      // Check if the strategy function exists
      // If not, just mark the bot as disabled
      try {
        findStrategy(bot.template);
      } catch (err) {
        logger.warn(
          `[Processor] Strategy "${bot.template}" not found. ` +
            "The strategy may have been removed, or the CUSTOM_STRATEGIES_PATH env is incorrect. " +
            `Marking the bot as disabled [Bot ID: ${bot.id}, Name: ${bot.name}]`,
        );

        await xprisma.bot.custom.update({
          where: { id: bot.id },
          data: { enabled: false, processing: false },
        });

        continue;
      }

      bot = await xprisma.bot.custom.update({
        where: { id: bot.id },
        data: { enabled: false, processing: false },
        include: { exchangeAccount: true },
      });

      const botProcessor = new BotProcessing(bot);
      await botProcessor.processStopCommand();

      logger.info(`[Processor] Bot stopped [id=${bot.id} name=${bot.name}]`);
    }
  }

  /**
   * When the app starts, check if there are any enabled bots and stop them gracefully.
   * This is necessary because the previous process might have been interrupted,
   * and there are open orders that need to be closed on the exchange.
   */
  async cleanOrphanedBots() {
    const anyBotEnabled = await xprisma.bot.custom.findFirst({
      where: { OR: [{ enabled: true }, { processing: true }] },
    });

    if (anyBotEnabled) {
      logger.warn(`[Processor] The previous process was interrupted, there are orphaned bots. Performing cleanup…`);
      await this.stopEnabledBots();
    }
  }

  /**
   * Loads custom strategies from the specified directory.
   * @param fullPath Absolute path to the directory with custom strategies
   */
  async loadCustomStrategies(fullPath: string) {
    logger.info(`Loading custom strategies from dir: ${fullPath}`);
    const customStrategies = await loadCustomStrategies(fullPath);
    const customStrategiesCount = Object.keys(customStrategies).length;

    if (customStrategiesCount > 0) {
      logger.info(`Loaded ${customStrategiesCount} custom strategies`);
    } else {
      logger.warn("No custom strategies found");
    }
  }

  /**
   * Subscribes to event bus events:
   *
   * - When a bot started → Subscribe to candles channel
   * - When a bot stopped → Unsubscribe from candles channel
   * - When an exchange account was created → Start watching for orders status change (filled, canceled, etc)
   * - When an exchange account was deleted → Stop watching for orders
   * - When an exchange account was updated → Resubcribe to orders channel with new credentials
   */
  private subscribeToEventBus() {
    const onBeforeBotStarted = async (_data: TBotWithExchangeAccount) => {
      //
    };

    const startBot = async (data: TBotWithExchangeAccount) => {
      const bot = new Bot(data, this.marketStream, this.ordersStream);
      await bot.start();
      this.enabledBots.push(bot);
    };

    const onBotStarted = async (_data: TBotWithExchangeAccount) => {
      //
    };

    const stopBot = async (data: TBotWithExchangeAccount) => {
      const bot = this.enabledBots.find(({ bot }) => bot.id === data.id);

      if (bot) {
        const botTrades = this.trades.filter((trade) => trade.smartTrade.botId === bot.bot.id);
        for (const trade of botTrades) {
          trade.unwatchStreams();
        }
        this.trades = this.trades.filter(({ smartTrade }) => smartTrade.botId !== bot.bot.id);

        await bot.stop();
        this.enabledBots = this.enabledBots.filter((enabledBot) => enabledBot !== bot);
      }
    };

    const onBeforeBotStopped = async (_data: TBotWithExchangeAccount) => {
      //
    };

    const onBotStopped = async (data: TBotWithExchangeAccount) => {
      this.enabledBots = this.enabledBots.filter(({ bot }) => bot.id !== data.id);
      await this.marketStream.clean(this.enabledBots.map(({ bot }) => bot));
    };

    const addExchangeAccount = async (exchangeAccount: ExchangeAccountWithCredentials) =>
      await this.ordersStream.addExchangeAccount(exchangeAccount);

    const removeExchangeAccount = async (exchangeAccount: ExchangeAccountWithCredentials) => {
      await this.ordersStream.removeExchangeAccount(exchangeAccount);
      exchangeProvider.removeByAccountId(exchangeAccount.id);
    };

    const updateExchangeAccount = async (exchangeAccount: ExchangeAccountWithCredentials) => {
      exchangeProvider.removeByAccountId(exchangeAccount.id);
      await this.ordersStream.updateExchangeAccount(exchangeAccount);
    };

    const onTradeCreated = async (trade: SmartTradeWithOrders) => {
      let tradeManager = this.trades.find(({ smartTrade }) => smartTrade.id === trade.id);
      if (!tradeManager) {
        tradeManager = new TradeManager(trade, this.ordersStream);
        this.trades.push(tradeManager);
      }

      await tradeManager.next();
    };

    const onTradeCompleted = async (trade: SmartTradeWithOrders) => {
      this.trades = this.trades.filter(({ smartTrade }) => smartTrade.id !== trade.id);
    };

    eventBus.on("startBot", startBot);
    eventBus.on("onBeforeBotStarted", onBeforeBotStarted);
    eventBus.on("onBotStarted", onBotStarted);
    eventBus.on("stopBot", stopBot);
    eventBus.on("onBeforeBotStopped", onBeforeBotStopped);
    eventBus.on("onBotStopped", onBotStopped);
    eventBus.on("onExchangeAccountCreated", addExchangeAccount);
    eventBus.on("onExchangeAccountDeleted", removeExchangeAccount);
    eventBus.on("onExchangeAccountUpdated", updateExchangeAccount);
    eventBus.on("onTradeCreated", onTradeCreated);
    eventBus.on("onTradeCompleted", onTradeCompleted);

    // Return unsubscribe function
    return () => {
      eventBus.off("startBot", startBot);
      eventBus.off("onBeforeBotStarted", onBeforeBotStarted);
      eventBus.off("onBotStarted", onBotStarted);
      eventBus.off("stopBot", stopBot);
      eventBus.off("onBeforeBotStopped", onBeforeBotStopped);
      eventBus.off("onBotStopped", onBotStopped);
      eventBus.off("onExchangeAccountCreated", addExchangeAccount);
      eventBus.off("onExchangeAccountDeleted", removeExchangeAccount);
      eventBus.off("onExchangeAccountUpdated", updateExchangeAccount);
      eventBus.off("onTradeCreated", onTradeCreated);
      eventBus.off("onTradeCompleted", onTradeCompleted);
    };
  }

  handleMarketEvent = (event: MarketEvent) => {
    store.updateMarket(event);
  };

  handleOrderEvent = async (_event: OrderEvent) => {
    //
  };
}
