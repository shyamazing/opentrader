import { Daemon } from "@opentrader/daemon";

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 8000;

const daemon = await Daemon.create({
  server: {
    frontendDistPath: "../frontend",
    port: port,
  },
});

async function shutdown() {
  await daemon.shutdown();

  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);