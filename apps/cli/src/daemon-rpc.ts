import superjson from "superjson";
import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import { appRouter } from "@opentrader/trpc";

import { getSettings } from "./utils/settings.js";

const settings = getSettings();

const { domain, port } = settings;
const DAEMON_URL = `http://${domain}:${port}/api/trpc`;

export const createDaemonRpcClient = () => {
  return createTRPCProxyClient<typeof appRouter>({
    transformer: superjson,
    links: [
      httpBatchLink({
        url: DAEMON_URL,
        headers: () => ({
          Authorization: process.env.ADMIN_PASSWORD,
        }),
      }),
    ],
  });
};
