import { settingsPath } from "./app-path.js";
import { readFileSync, writeFileSync, existsSync } from "fs";

const defaultSettings = {
    detach: false,
    port: 8000,
    domain: "localhost"
};

export const getSettings = () => {
    if (existsSync(settingsPath)) {
        return JSON.parse(readFileSync(settingsPath, "utf-8"));
    } else {
        writeFileSync(settingsPath, JSON.stringify(defaultSettings, null, 2));
        return defaultSettings;
    }
};
