import path from "node:path";
import { fileURLToPath } from "node:url";
import superjson from 'superjson';

// tRPC imports
import { appRouter } from "@opentrader/trpc";
import { createContext } from "./trpc.js";


// Fastify imports
import Fastify from 'fastify';
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import fastifyCors from '@fastify/cors';
import fastifyStatic from '@fastify/static';

// Path to the current file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


/**
 * Options for creating a server.
 * 
 * @property {string} frontendDistPath - The path to the frontend distribution files.
 * @property {number} port - The port number on which the server will listen.
 */
export type CreateServerOptions = {
  frontendDistPath: string;
  port: number;
};


/**
 * Creates and configures a Fastify server instance with specified options.
 *
 * @param {CreateServerOptions} params - The options for creating the server.
 * @param {string} params.frontendDistPath - The path to the frontend distribution directory.
 * @param {number} params.port - The port on which the server will listen.
 *
 * @returns {object} An object containing the Fastify app instance, the server instance, 
 *                   and methods to listen and close the server.
 * @returns {FastifyInstance} return.app - The Fastify app instance.
 * @returns {Server} return.server - The underlying server instance.
 * @returns {Function} return.listen - A function to start the server and listen on the specified port.
 * @returns {Function} return.close - A function to close the server.
 */
export const createServer = (params: CreateServerOptions) => {
  const fastify = Fastify({
    logger: true,
    maxParamLength: 1000,
  });
  const staticDir = path.join(__dirname, params.frontendDistPath);

  fastify.register(fastifyCors, {
    origin: true,
  });

  fastify.register(fastifyStatic, {
    root: staticDir,
    prefix: '/', // optional: default '/'
  });

  fastify.register(fastifyTRPCPlugin, {
    prefix: '/api/trpc',
    trpcOptions: {
      router: appRouter,
      createContext: createContext as () => ReturnType<typeof createContext>,
      transformer: superjson, // matching the transformer used in the client
    },
  });

  return {
    app: fastify,
    server: fastify.server,
    listen: async () => {
      try {
        await fastify.listen({ port: params.port, host: '0.0.0.0' }); // Listen on all interfaces, remove host to listen only on localhost
        fastify.log.info(`Server listening at http://localhost:${params.port}`);
      } catch (err) {
        fastify.log.error(err);
        process.exit(1);
      }
    },
    close: async () => {
      await fastify.close();
    }
  };
};
