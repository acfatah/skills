import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { CliError } from "./errors.ts";

export interface RemoteDb {
  url: string;
  token?: string;
  tokenEnv?: string;
}

export interface ProjectConfig {
  backend: "local" | "turso";
  issues?: RemoteDb;
  security?: RemoteDb;
}

export interface Config {
  projects?: Record<string, ProjectConfig>;
  dirs?: Record<string, string>;
}

export function configPath(): string {
  if (process.env.XDG_CONFIG_HOME) {
    return join(process.env.XDG_CONFIG_HOME, "issue-tracker", "config.json");
  }
  if (process.platform === "win32" && process.env.APPDATA) {
    return join(process.env.APPDATA, "issue-tracker", "config.json");
  }
  return join(homedir(), ".config", "issue-tracker", "config.json");
}

export function readConfig(warn: (msg: string) => void = () => {}): Config {
  const path = configPath();
  if (!existsSync(path)) return {};
  if (process.platform !== "win32" && (statSync(path).mode & 0o077) !== 0) {
    warn(`warning: ${path} is readable by other users and may hold tokens. Run: chmod 600 ${path}`);
  }
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Config;
  } catch (err) {
    throw new CliError(`Cannot read ${path}: ${(err as Error).message}`);
  }
}

// Writes atomically with mode 0600, since the file may hold tokens.
export function writeConfig(config: Config): void {
  const path = configPath();
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, path);
}

export function resolveToken(db: RemoteDb, which: string): string {
  if (db.token) return db.token;
  if (db.tokenEnv) {
    const token = process.env[db.tokenEnv];
    if (!token) {
      throw new CliError(`The ${which} token is read from $${db.tokenEnv}, which is not set.`);
    }
    return token;
  }
  throw new CliError(`No token configured for the ${which} database. Set token or tokenEnv in ${configPath()}.`);
}
