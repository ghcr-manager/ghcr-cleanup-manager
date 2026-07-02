#!/usr/bin/env node
/* global process */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeGitHubOutputs } from "./_github-output.mjs";

export function buildDbPath(env) {
  const dbFile = _buildDbFileName(_requireEnv(env, "OWNER"), _requireEnv(env, "PACKAGE"));
  const inputDbPath = env.INPUT_DB_PATH;

  if (inputDbPath) {
    return {
      dbFile: path.basename(inputDbPath),
      dbPath: inputDbPath
    };
  }

  const tempDirectory = mkdtempSync(path.join(env.RUNNER_TEMP || tmpdir(), "ghcr-cleanup-manager-db-"));
  return {
    dbFile,
    dbPath: path.join(tempDirectory, dbFile)
  };
}

function _buildDbFileName(owner, packageName) {
  return `${_sanitizeFileComponent(owner)}__${_sanitizeFileComponent(packageName)}.sqlite`;
}

function _sanitizeFileComponent(value) {
  return value.replaceAll("/", "__");
}

function _requireEnv(env, key) {
  const value = env[key];
  if (!value) {
    throw new Error(`${key} is required`);
  }

  return value;
}

function _main() {
  const db = buildDbPath(process.env);
  writeGitHubOutputs(process.env.GITHUB_OUTPUT, {
    db_file: db.dbFile,
    db_path: db.dbPath
  });
}

const _isDirectExecution =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (_isDirectExecution) {
  _main();
}
