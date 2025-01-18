import { readFileSync, writeFileSync, existsSync } from "fs";
import { logger } from "@opentrader/logger";
import { settingsPath } from "./app-path.js";

type DaemonSettings = {
  host: string;
  port: number;
};

export const defaultSettings: DaemonSettings = {
  host: "127.0.0.1",
  port: 8000,
};

export function getSettings(): DaemonSettings {
  if (existsSync(settingsPath)) {
    try {
      return JSON.parse(readFileSync(settingsPath, "utf-8"));
    } catch (error) {
      logger.warn("Error parsing settings file:", error);
      return defaultSettings;
    }
  } else {
    return saveSettings(defaultSettings);
  }
}

export function saveSettings(settings: DaemonSettings): DaemonSettings {
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

  return defaultSettings;
}
