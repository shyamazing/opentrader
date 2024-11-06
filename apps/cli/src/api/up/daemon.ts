import { Daemon } from "@opentrader/daemon";

const daemon = await Daemon.create({
  server: {
    frontendDistPath: "../frontend",
    port: 8000,
  },
});

async function shutdown() {
  await daemon.shutdown();

  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
