import { Command, Option } from "commander";
import { handle } from "../utils/command.js";
import { up } from "../api/up/index.js";

export function addUpCommand(program: Command) {
  program.command("up")
  .addOption(new Option("-d, --detach", "Run in detached mode").default(false)).action(handle(up))
  .addOption(new Option("-p, --port <port>", "Customize port server should attach to").default(8000))
  .action(handle(up));
}
