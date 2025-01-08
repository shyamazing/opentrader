import superjson from "superjson";
import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import { appRouter } from "@opentrader/trpc";

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 8000;
const domain = process.env.DOMAIN || 'localhost';

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
