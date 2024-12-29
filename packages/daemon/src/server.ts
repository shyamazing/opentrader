import path from "node:path";
import { fileURLToPath } from "node:url";
import serveHandler from "serve-handler";
import Fastify, { FastifyInstance } from 'fastify';
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
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
   * Listen Fastify on port
   */
  port: number;
};

export class Server {
  private fastify: FastifyInstance;

  constructor() {
    this.fastify = Fastify();
  }

  createServer(params: CreateServerOptions): void {
    const staticDir = path.join(__dirname, params.frontendDistPath);

    this.fastify.register(require('@fastify/cors'), {
      origin: true,
    });

    this.fastify.register(require('@fastify/static'), {
      root: staticDir,
      prefix: '/', // optional: default '/'
    });

    this.fastify.route({
      method: 'GET',
      url: '/*',
      handler: async (request, reply) => {
        await serveHandler(request.raw, reply.raw, { public: staticDir });
        reply.sent = true;
      }
    });

    this.fastify.register(fastifyTRPCPlugin, {
      prefix: '/api/trpc',
      trpcOptions: { router: appRouter, createContext: createContext as () => ReturnType<typeof createContext> },
    });
  }

  async startServer(params: CreateServerOptions): Promise<void> {
    this.createServer(params);
    try {
      await this.fastify.listen({ port: params.port });
      this.fastify.log.info(`Server listening at http://localhost:${params.port}`);
    } catch (err) {
      this.fastify.log.error(err);
      process.exit(1);
    }
  }

  async closeServer(): Promise<void> {
    await this.fastify.close();
  }
}