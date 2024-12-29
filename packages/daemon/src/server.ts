import path from "node:path";
import { fileURLToPath } from "node:url";
import serveHandler from "serve-handler";
import Fastify from 'fastify';
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
   * Listen Express on port
   */
  port: number;
};

const fastify = Fastify();

export const createServer = (params: CreateServerOptions) => {

  const staticDir = path.join(__dirname, params.frontendDistPath);

  fastify.register(require('@fastify/cors'), {
    origin: true,
  });

  fastify.register(require('@fastify/static'), {
    root: staticDir,
    prefix: '/', // optional: default '/'
  });

  fastify.route({
    method: 'GET',
    url: '/*',
    handler: async (request, reply) => {
      await serveHandler(request.raw, reply.raw, { public: staticDir });
      reply.sent = true;
    }
  });

  fastify.register(fastifyTRPCPlugin, {
    prefix: '/api/trpc',
    trpcOptions: { router: appRouter, createContext: createContext as () => ReturnType<typeof createContext> },
  });

  return fastify.listen({ port: params.port }, (err, address) => {
    if (err) {
      fastify.log.error(err);
      process.exit(1);
    }
    fastify.log.info(`Server listening at ${address}`);
  });
};

export const closeServer = () => {
  fastify.close();
};