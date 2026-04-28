#!/usr/bin/env node

import { openDatabase } from "./database.js";
import { loadSnapshotFromGitHub } from "./github-snapshot-source.js";
import { buildPlanSummary } from "./planner.js";
import { Repository } from "./repository.js";
import { loadSnapshotFromFile } from "./snapshot-source.js";
import type { PlanOptions } from "./types.js";

export async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  if (!command) {
    _printUsage();
    return 1;
  }

  switch (command) {
    case "init-db":
      return _handleInitDb(rest);
    case "scan":
      return _handleScan(rest);
    case "plan-summary":
      return _handlePlanSummary(rest);
    default:
      throw new Error(`unknown command: ${command}`);
  }
}

async function _handleInitDb(args: string[]): Promise<number> {
  const databasePath = _requireOption(args, "--db");
  const database = openDatabase(databasePath);
  database.close();
  return 0;
}

async function _handleScan(args: string[]): Promise<number> {
  const databasePath = _requireOption(args, "--db");
  const database = openDatabase(databasePath);
  const repository = new Repository(database);
  const snapshot = await _loadSnapshot(args);
  repository.replaceSnapshot(snapshot);
  console.log(
    JSON.stringify(
      {
        packageName: snapshot.packageName,
        scannedAt: snapshot.scannedAt,
        packageVersions: snapshot.packageVersions.length,
        tags: snapshot.tags.length,
        manifests: snapshot.manifests.length,
        manifestEdges: snapshot.manifestEdges.length,
      },
      null,
      2,
    ),
  );
  database.close();
  return 0;
}

async function _loadSnapshot(args: string[]) {
  const source = _findOption(args, "--source") ?? "file";
  switch (source) {
    case "file":
      return loadSnapshotFromFile(_requireOption(args, "--snapshot"));
    case "github":
      return loadSnapshotFromGitHub({
        owner: _requireOption(args, "--owner"),
        packageName: _requireOption(args, "--package"),
        token: _resolveToken(args),
      });
    default:
      throw new Error(`unknown scan source: ${source}`);
  }
}

async function _handlePlanSummary(args: string[]): Promise<number> {
  const databasePath = _requireOption(args, "--db");
  const olderThanDays = Number(_requireOption(args, "--older-than-days"));
  if (!Number.isInteger(olderThanDays) || olderThanDays < 0) {
    throw new Error("--older-than-days must be a non-negative integer");
  }

  const options: PlanOptions = {
    olderThanDays,
    deleteUntagged: args.includes("--delete-untagged"),
    excludeTags: _collectRepeatedOption(args, "--exclude-tag"),
  };

  const database = openDatabase(databasePath);
  const repository = new Repository(database);
  const summary = buildPlanSummary(repository, options);
  console.log(JSON.stringify(summary, null, 2));
  database.close();
  return 0;
}

function _requireOption(args: string[], name: string): string {
  const value = _findOption(args, name);
  if (!value) {
    throw new Error(`missing required option: ${name}`);
  }

  return value;
}

function _findOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) {
    return undefined;
  }

  return args[index + 1];
}

function _collectRepeatedOption(args: string[], name: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === name && args[index + 1]) {
      values.push(args[index + 1] as string);
    }
  }
  return values;
}

function _resolveToken(args: string[]): string {
  const cliToken = _findOption(args, "--token");
  if (cliToken) {
    return cliToken;
  }

  const envToken = process.env.GITHUB_TOKEN;
  if (envToken) {
    return envToken;
  }

  throw new Error("missing GitHub token: pass --token or set GITHUB_TOKEN");
}

function _printUsage(): void {
  console.error(`Usage:
  ghcr-manager init-db --db <path>
  ghcr-manager scan --db <path> [--source file --snapshot <path>]
  ghcr-manager scan --db <path> --source github --owner <org> --package <name> [--token <token>]
  ghcr-manager plan-summary --db <path> --older-than-days <days> [--delete-untagged] [--exclude-tag <tag>]`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
