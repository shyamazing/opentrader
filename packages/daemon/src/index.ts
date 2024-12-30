/**
 * Copyright 2024 bludnic
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Repository URL: https://github.com/bludnic/opentrader
 */
import { Platform } from "@opentrader/bot";
import { logger } from "@opentrader/logger";
import { createServer, CreateServerOptions } from "./server.js";
import { bootstrapPlatform } from "./platform.js";

type DaemonParams = {
  server: CreateServerOptions;
};

export class Daemon {
  constructor(
    private platform: Platform,
    private server: ReturnType<typeof createServer>,
  ) {}

  static async create(params: DaemonParams): Promise<Daemon> {
    try {
      logger.info("Bootstrapping platform...");
      const platform = await bootstrapPlatform();
      logger.info("✅ Platform bootstrapped successfully");

      logger.info("Creating server...");
      const server = createServer(params.server);
      logger.info("✅ Server created successfully");

      logger.info("Starting server...");
      try {
        server.listen();
      } catch (error) {
        logger.error("Error during server start:", error);
        throw error;
      }
      logger.info("✅ Server started successfully");
      logger.info(`RPC Server listening on port ${params.server.port}`);
      logger.info(`OpenTrader UI: http://localhost:${params.server.port}`);

      return new Daemon(platform, server);
    } catch (error) {
      logger.error("Error during Daemon creation:", error);
      throw error;
    }
  }

  async restart() {
    await this.platform.shutdown();

    this.platform = await bootstrapPlatform();
  }

  async shutdown() {
    logger.info("Shutting down Daemon...");

    await this.server.close();
    logger.info("Fastify Server shutted down gracefully.");

    await this.platform.shutdown();
    logger.info("Processor shutted down gracefully.");
  }
}

export { tServer } from "./trpc.js";
