import path from "node:path";
import { fileURLToPath } from "node:url";
import serveHandler from "serve-handler";
import Fastify from 'fastify';
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import { appRouter } from "@opentrader/trpc";
import { createContext } from "./trpc.js";
import fastifyCors from '@fastify/cors';
import fastifyStatic from '@fastify/static';

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

export const createServer = (params: CreateServerOptions) => {
  const fastify = Fastify({
    logger: true
  });
  const staticDir = path.join(__dirname, params.frontendDistPath);

  try {
    fastify.register(fastifyCors, {
      origin: true,
    });

    fastify.register(fastifyStatic, {
      root: staticDir,
      prefix: '/', // optional: default '/'
    });
  } catch (err) {
    fastify.log.error('Error registering plugins:', err);
    process.exit(1);
  }

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

  return {
    app: fastify,
    server: fastify.server,
    listen: async () => {
      try {
        await fastify.listen({ port: params.port, host: '0.0.0.0' }); // Listen on all interfaces, remove host to listen only on localhost
        fastify.log.info(`Server listening at http://localhost:${params.port}`);
      } catch (err) {
        fastify.log.error(err)
        process.exit(1)
      }
    },
    close: async () => {
      await fastify.close();
    }
  };
};