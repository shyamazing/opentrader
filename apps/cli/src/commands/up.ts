import { Command, Option } from "commander";
import { handle } from "../utils/command.js";
import { settingsPath } from "../utils/app-path.js";
import { up } from "../api/up/index.js";
import { writeFileSync } from "fs";

import { getSettings } from "../utils/settings.js";


export function addUpCommand(program: Command) {
  const settings = getSettings();

  program.command("up")
    .addOption(new Option("-d, --detach", "Run in detached mode").default(settings.detach))
    .addOption(new Option("-p, --port <port>", "Customize port server should attach to").default(settings.port))
    .addOption(new Option("-D, --domain <domain>", "Customize domain server should attach to").default(settings.domain))
    .helpOption("-h, --help", "Display help for command")
    .action((options) => {
      const newSettings = {
        detach: options.detach,
        port: options.port,
        domain: options.domain
      };
      writeFileSync(settingsPath, JSON.stringify(newSettings, null, 2));
      handle(up)(options);
    });
}
