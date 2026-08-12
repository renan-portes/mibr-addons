import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULT_PORT = 7000;

export function loadEnvFile(envPath = resolve(process.cwd(), ".env")): void {
  if (!existsSync(envPath)) {
    return;
  }

  try {
    const content = readFileSync(envPath, "utf8");
    const lines = content.split(/\r?\n/);

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const equalIndex = trimmed.indexOf("=");
      if (equalIndex === -1) continue;

      const key = trimmed.slice(0, equalIndex).trim();
      let value = trimmed.slice(equalIndex + 1).trim();

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch {
    // Ignore invalid or unreadable .env file
  }
}

export function getPort(env: NodeJS.ProcessEnv = process.env): number {
  const rawPort = env.PORT;

  if (rawPort === undefined) {
    return DEFAULT_PORT;
  }

  if (!/^\d+$/.test(rawPort)) {
    throw new Error(`Invalid PORT value: ${rawPort}`);
  }

  const port = Number(rawPort);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT value: ${rawPort}`);
  }

  return port;
}
