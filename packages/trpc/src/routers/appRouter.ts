import { trpc } from "../trpc.js";
import {
  botRouter,
  cronRouter,
  exchangeAccountsRouter,
  dcaBotRouter,
  gridBotRouter,
  smartTradeRouter,
  symbolsRouter,
  orderRouter,
} from "./private/router.js";
import { publicRouter } from "./public/router.js";

export const appRouter = trpc.router({
  exchangeAccount: exchangeAccountsRouter,
  symbol: symbolsRouter,
  bot: botRouter,
  dcaBot: dcaBotRouter,
  gridBot: gridBotRouter,
  smartTrade: smartTradeRouter,
  order: orderRouter,
  cron: cronRouter,
  public: publicRouter,
});

export type AppRouter = typeof appRouter;
