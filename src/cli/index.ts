#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { openDatabase } from "../db/index.js";
import { requireOption } from "./_args.js";
import { handleScan } from "./_scan-command.js";

export async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  if (!command) {
    printUsage();
    return 1;
  }

  switch (command) {
    case "init-db":
      return handleInitDb(rest);
    case "scan":
      return handleScan(rest);
    default:
      throw new Error(`unknown command: ${command}`);
  }
}

async function handleInitDb(args: string[]): Promise<number> {
  const databasePath = requireOption(args, "--db");
  const database = openDatabase(databasePath);
  database.close();
  return 0;
}

function printUsage(): void {
  console.error(`Usage:
  ghcr-manager init-db --db <path>
  ghcr-manager scan --db <path> [--log-level <debug|info|warn|error|silent>] --owner <org> --package <name> [--token <token>]`);
}

const _entryPath = process.argv[1];
const _isDirectExecution =
  typeof _entryPath === "string" && realpathSync(_entryPath) === realpathSync(fileURLToPath(import.meta.url));

if (_isDirectExecution) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
