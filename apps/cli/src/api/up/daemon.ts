import { Daemon } from "@opentrader/daemon";

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 8000;
const domain = process.env.DOMAIN || 'localhost';

const daemon = await Daemon.create({
  server: {
    frontendDistPath: "../frontend",
    port: port,
    domain: domain,
  },
});

async function shutdown() {
  await daemon.shutdown();

  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);