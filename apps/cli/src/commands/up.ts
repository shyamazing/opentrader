import { Command, Option } from "commander";
import { handle } from "../utils/command.js";
import { settingsPath } from "../utils/app-path.js";
import { up } from "../api/up/index.js";
import { writeFileSync } from "fs";

import { getSettings } from "../utils/settings.js";


export function addUpCommand(program: Command) {
  const settings = getSettings();

  program.command("up")
    .addOption(new Option("-d, --detach", "Run in detached mode").default(false))
    .addOption(new Option("-p, --port <port>", "Customize port server should attach to").default(settings.port))
    .addOption(new Option("-h, --host <host>", "Customize domain server should attach to").default(settings.host))
    .helpOption("-h, --help", "Display help for command")
    .action((options) => {
      handle(up)(options);
    });
}
