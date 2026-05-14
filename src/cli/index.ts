#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { handlePlan } from "./_plan-command.js";
import { handleScan } from "./_scan-command.js";

export async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  if (!command) {
    printUsage();
    return 1;
  }

  switch (command) {
    case "plan":
      return handlePlan(rest);
    case "scan":
      return handleScan(rest);
    default:
      throw new Error(`unknown command: ${command}`);
  }
}

function printUsage(): void {
  console.error(`Usage:
  ghcr-manager plan --db <path> --owner <org> --package <name> --delete-untagged [--older-than <interval>]
  ghcr-manager plan --db <path> --owner <org> --package <name> --keep-n-tagged <count> [--older-than <interval>]
  ghcr-manager plan --db <path> --owner <org> --package <name> --keep-n-untagged <count> [--older-than <interval>]
  ghcr-manager plan --db <path> --owner <org> --package <name> --delete-tag <tag> [--delete-tag <tag> ...] [--exclude-tag <tag> ...] [--older-than <interval>]
  ghcr-manager scan --db <path> [--log-level <debug|info|warn|error|silent>] --owner <org> --package <name> --token <token>`);
}

const _entryPath = process.argv[1];
const _isDirectExecution = realpathSync(_entryPath) === realpathSync(fileURLToPath(import.meta.url));

if (_isDirectExecution) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
