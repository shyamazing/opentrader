import { Daemon } from "@opentrader/daemon";
import { getSettings } from "../../utils/settings.js";

const settings = getSettings();
const port = settings.port;
const host = settings.host;

const daemon = await Daemon.create({
  server: {
    frontendDistPath: "../frontend",
    port: port,
    domain: host,
  },
});

async function shutdown() {
  await daemon.shutdown();

  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
