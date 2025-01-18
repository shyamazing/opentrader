import { Daemon } from "@opentrader/daemon";
import { getSettings } from "../../utils/settings.js";

const settings = getSettings();
const { host, port } = settings;

const daemon = await Daemon.create({
  server: {
    frontendDistPath: "../frontend",
    port,
    host,
  },
});

async function shutdown() {
  await daemon.shutdown();

  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
