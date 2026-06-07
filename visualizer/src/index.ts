#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startVisualizerServer } from "./_server.js";
export type { VisualizerServerHandle } from "./_server.js";

export interface CliOptions {
  databasePath: string;
  host: string;
  port: number;
}

export async function main(args: string[], startServer = startVisualizerServer): Promise<void> {
  const options = parseArgs(args);
  const server = await startServer({
    databasePath: resolveDatabasePath(options.databasePath),
    host: options.host,
    port: options.port
  });
  const shutdown = async () => {
    process.removeListener("SIGINT", shutdown);
    await server.close();
  };
  process.on("SIGINT", shutdown);
}

export function parseArgs(args: string[]): CliOptions {
  let databasePath: string | undefined;
  let host = "127.0.0.1";
  let port = 0;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];
    if (arg === "--db" && value) {
      databasePath = value;
      index += 1;
      continue;
    }
    if (arg === "--host" && value) {
      host = value;
      index += 1;
      continue;
    }
    if (arg === "--port" && value) {
      port = Number.parseInt(value, 10);
      index += 1;
      continue;
    }

    throw new Error(`unknown or incomplete argument: ${arg}`);
  }

  if (!databasePath) {
    throw new Error("missing required option: --db");
  }
  if (!Number.isInteger(port) || port < 0) {
    throw new Error(`invalid port: ${port}`);
  }

  return { databasePath, host, port };
}

export function resolveDatabasePath(databasePath: string): string {
  if (isAbsolute(databasePath)) {
    return databasePath;
  }

  const invocationRoot = process.env.INIT_CWD;
  if (invocationRoot) {
    return resolve(invocationRoot, databasePath);
  }

  return resolve(databasePath);
}

if (process.argv[1]) {
  const invokedPath = realpathSync(process.argv[1]);
  const currentPath = realpathSync(fileURLToPath(import.meta.url));
  if (invokedPath === currentPath) {
    await main(process.argv.slice(2));
  }
}
