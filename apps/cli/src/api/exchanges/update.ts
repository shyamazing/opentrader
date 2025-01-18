import { ExchangeCode } from "@opentrader/types";
import { logger } from "@opentrader/logger";
import type { CommandResult } from "../../types.js";
import { createDaemonRpcClient } from "../../daemon-rpc.js";

type Options = {
  config: string;
  /**
   * Exchange name.
   */
  name: string | null;
  /**
   * Exchange label.
   */
  label: string;
  code: ExchangeCode;
  key: string;
  secret: string;
  password: string | null;
  /**
   * Is demo account?
   */
  demo: boolean;
  /**
   * Is paper account?
   */
  paper: boolean;
};


export async function updateExchangeAccount(options: Options): Promise<CommandResult> {
  const daemonRpc = createDaemonRpcClient();
  const exchangeAccounts = await daemonRpc.exchangeAccount.list.query();
  const exchangeAccount = exchangeAccounts.find((account) => account.label === options.label);

  if (!exchangeAccount) {
    logger.error(`Exchange account with label "${options.label}" not found in DB. Create it first.`);
    return {
      result: undefined,
    };
  }

  await daemonRpc.exchangeAccount.update.mutate({
    id: exchangeAccount.id,
    body: {
      name: options.name || exchangeAccount.name,
      exchangeCode: options.code,
      apiKey: options.key,
      secretKey: options.secret,
      password: options.password,
      isDemoAccount: options.demo,
      isPaperAccount: options.paper,
    },
  });

  return {
    result: `Exchange account with label "${exchangeAccount.label}" updated successfully.`,
  };
}
