import { settingsPath } from "./app-path.js";
import { readFileSync, writeFileSync, existsSync } from "fs";

type DaemonSettings = {
  host: string;
  port: number;
};

const defaultSettings: DaemonSettings = {
  host: "127.0.0.1",
  port: 8000,
};

export function getSettings(): DaemonSettings {
  if (existsSync(settingsPath)) {
    try {
      return JSON.parse(readFileSync(settingsPath, "utf-8"));
    } catch (error) {
      console.warn("Error parsing settings file:", error);
      return defaultSettings;
    }
  } else {
    writeFileSync(settingsPath, JSON.stringify(defaultSettings, null, 2));
    return defaultSettings;
  }
}
