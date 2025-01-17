import { settingsPath } from "./app-path.js";
import { readFileSync, writeFileSync, existsSync } from "fs";

const defaultSettings = {
    port: 8000,
    host: "localhost"
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
