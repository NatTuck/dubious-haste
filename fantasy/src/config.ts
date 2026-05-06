import { readFileSync, existsSync, mkdirSync, copyFileSync } from "fs";
import { resolve } from "path";
import { homedir } from "os";
import YAML from "yaml";
import { Config, ConfigSchema } from "./types.js";

export function loadConfig(path?: string): Config {
  // If a custom path is provided, use it directly
  if (path) {
    const content = readFileSync(path, "utf-8");
    const parsed = YAML.parse(content);
    const withEnv = JSON.parse(
      JSON.stringify(parsed).replace(/\$\{([^}]+)\}/g, (_, name) => {
        return process.env[name] || "";
      })
    );
    return ConfigSchema.parse(withEnv);
  }

  // Determine paths
  const projectConfigPath = resolve(process.cwd(), "config.yaml");
  const userConfigDir = resolve(homedir(), ".config", "dubious");
  const userConfigPath = resolve(userConfigDir, "config.yaml");

  // Check if user config exists
  if (!existsSync(userConfigPath)) {
    // Create ~/.config/dubious directory
    mkdirSync(userConfigDir, { recursive: true });

    // Copy ./config.yaml to ~/.config/dubious/config.yaml
    copyFileSync(projectConfigPath, userConfigPath);

    console.log(`Config created at ${userConfigPath}. Please edit and run again.`);
    process.exit(0);
  }

  // Load the user config
  const content = readFileSync(userConfigPath, "utf-8");
  const parsed = YAML.parse(content);

  // Replace environment variables
  const withEnv = JSON.parse(
    JSON.stringify(parsed).replace(/\$\{([^}]+)\}/g, (_, name) => {
      return process.env[name] || "";
    })
  );

  return ConfigSchema.parse(withEnv);
}
