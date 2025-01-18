import { Command, Option } from "commander";
import { handle } from "../utils/command.js";
import { up } from "../api/up/index.js";
import { defaultSettings } from "../utils/settings.js";

export function addUpCommand(program: Command) {
  program
    .command("up")
    .addOption(new Option("-d, --detach", "Run in detached mode").default(false))
    .addOption(new Option("--host <host>", "Customize domain server should attach to").default(defaultSettings.host))
    .addOption(new Option("-p, --port <port>", "Customize port server should attach to").default(defaultSettings.port))
    .action(handle(up));
}
