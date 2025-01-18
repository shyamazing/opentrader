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
  /**
   * Constructs an instance of the class Daemon, called from the create class method.
   *
   * @param platform - The platform instance used by the class.
   * @param server - The server instance created by the `createServer` function.
   */
  constructor(
    private platform: Platform,
    private server: ReturnType<typeof createServer>,
  ) {}

  /**
   * Creates a new Daemon instance.
   * @param params - The parameters required to create the Daemon.
   * @returns A promise that resolves to a Daemon instance.
   */
  static async create(params: DaemonParams): Promise<Daemon> {
    const platform = await bootstrapPlatform();
    logger.info("✅ Platform bootstrapped successfully");

    const server = createServer(params.server);
    await server.listen();

    logger.info(`RPC Server listening on port ${params.server.port}`);
    logger.info(`OpenTrader UI: http://${params.server.host}:${params.server.port}`);

    return new Daemon(platform, server);
  }

  /**
   * Restarts the Daemon by shutting down the platform and bootstrapping it again.
   */
  async restart() {
    await this.platform.shutdown();

    this.platform = await bootstrapPlatform();
  }

  /**
   * Shuts down the Daemon by closing the server and shutting down the platform.
   */
  async shutdown() {
    logger.info("Shutting down Daemon...");

    await this.server.close();
    logger.info("Fastify Server shutted down gracefully.");

    await this.platform.shutdown();
    logger.info("Processor shutted down gracefully.");
  }
}

export { tServer } from "./trpc.js";
