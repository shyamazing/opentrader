import { Command, Option } from "commander";
import { handle } from "../utils/command.js";
import { up } from "../api/up/index.js";

export function addUpCommand(program: Command) {
  program.command("up")
    .addOption(new Option("-d, --detach", "Run in detached mode").default(false))
    .addOption(new Option("-p, --port <port>", "Customize port server should attach to").default(8000))
    .addOption(new Option("-D, --domain <domain>", "Customize domain server should attach to").default("localhost"))
    .helpOption("-h, --help", "Display help for command")
    .action(handle(up));
}
