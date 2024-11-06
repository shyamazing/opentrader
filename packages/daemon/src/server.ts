import path from "node:path";
import { fileURLToPath } from "node:url";
import serveHandler from "serve-handler";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import express, { type Express } from "express";
import cors from "cors";

import { appRouter } from "@opentrader/trpc";
import { createContext } from "./trpc.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type CreateServerOptions = {
  /**
   * Relative path to the Frontend dist directory, e.g. "../frontend" or "../../frontend/dist" for dev
   */
  frontendDistPath: string;
  /**
   * Listen Express on port
   */
  port: number;
};

export const createServer = ({ frontendDistPath, port }: CreateServerOptions) => {
  const app: Express = express();
  let server: ReturnType<typeof app.listen> | null = null;

  return {
    app,
    server,
    listen: (cb?: () => void) => {
      app.use(cors());

      // Configure tRPC
      app.use(
        "/api/trpc",
        createExpressMiddleware({
          router: appRouter,
          createContext,
        }),
      );

      // Serve Frontend app
      const staticDir = path.resolve(__dirname, frontendDistPath);
      app.get("*", (req, res) => serveHandler(req, res, { public: staticDir }));

      server = app.listen(port, cb);

      return server;
    },
    close: () => {
      server?.close();
    },
  };
};
