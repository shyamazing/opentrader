import { settingsPath } from "./app-path.js";
import { readFileSync, writeFileSync, existsSync } from "fs";

const defaultSettings = {
    detach: false,
    port: 8000,
    domain: "localhost"
};

export const getSettings = () => {
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
};
