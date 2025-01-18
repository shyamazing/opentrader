import { BarSize } from "@opentrader/types";
import { logger } from "@opentrader/logger";
import { findStrategy } from "@opentrader/bot-templates/server";
import { ExchangeAccountWithCredentials, xprisma } from "@opentrader/db";
import { tServer } from "@opentrader/daemon";
import type { CommandResult } from "../types.js";
import { createDaemonRpcClient } from "../daemon-rpc.js";
import { readBotConfig, readExchangesConfig } from "../config.js";
import { createOrUpdateBot, createOrUpdateExchangeAccounts, resetProcessing } from "src/utils/bot.js";

type Options = {
  config: string;
  pair?: string;
  exchange?: string;
  timeframe?: BarSize;
};


export async function runTrading(strategyName: string, options: Options): Promise<CommandResult> {
  const daemonRpc = createDaemonRpcClient();
  const config = readBotConfig(options.config);
  logger.debug(config, "Parsed bot config");

  const exchangesConfig = readExchangesConfig(options.config);
  logger.debug(exchangesConfig, "Parsed exchanges config");

  let strategy: ReturnType<typeof findStrategy>;
  try {
    strategy = findStrategy(strategyName);
  } catch (err) {
    logger.info((err as Error).message);

    return {
      result: undefined,
    };
  }

  // Validate strategy params
  const { success: isValidSchema, error } = strategy.strategyFn.schema.safeParse(config.settings);
  if (!isValidSchema) {
    logger.error(error.message);
    logger.error(`The params for "${strategyName}" strategy are invalid. Check the "config.dev.json5"`);

    return {
      result: undefined,
    };
  }

  let bot = await xprisma.bot.custom.findUnique({
    where: {
      label: config.label || "default",
    },
  });

  const isDaemonRunning = await checkDaemonHealth(daemonRpc);
  if (!isDaemonRunning) {
    logger.info("Daemon is not running. Please start it before running the bot");

    return {
      result: undefined,
    };
  }

  if (bot?.processing) {
    logger.warn(`Bot "${bot.label}" is already processing. It could happen because previous process was interrupted.`);
    await resetProcessing(bot.id);
    logger.warn(`The bot processing state was cleared`);
  }

  if (bot?.enabled) {
    logger.info(`Bot "${bot.label}" is already enabled. Cancelling previous orders...`);
    await tServer.bot.stop({ botId: bot.id });

    logger.info(`The bot was stoped`);
  }

  const exchangeAccounts: ExchangeAccountWithCredentials[] = await createOrUpdateExchangeAccounts(exchangesConfig);
  bot = await createOrUpdateBot(strategyName, options, config, exchangeAccounts);

  const result = await daemonRpc.bot.start.mutate({ botId: bot.id });

  if (result) {
    logger.info(`Bot "${bot.label}" started succesfully`);
  } else {
    logger.error(`Bot "${bot.label}" failed to start. Check the daemon logs`);
  }

  return {
    result: undefined,
  };
}

async function checkDaemonHealth(daemonRpc: ReturnType<typeof createDaemonRpcClient>) {
  try {
    await daemonRpc.public.healhcheck.query();

    return true;
  } catch (err) {
    return false;
  }
}
