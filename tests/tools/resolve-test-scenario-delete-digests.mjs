#!/usr/bin/env node
/* global process */

import fs from "node:fs";
import Database from "better-sqlite3";

const resolutionPath = process.argv[2];
const dbPath = process.argv[3];

if (!resolutionPath || !dbPath) {
  throw new Error("usage: node tests/tools/resolve-test-scenario-delete-digests.mjs <resolution-path> <db-path>");
}

const resolution = JSON.parse(fs.readFileSync(resolutionPath, "utf8"));
const digestSelectorTagNameKey = resolution.digestSelectorTagNameKey;
if (!digestSelectorTagNameKey) {
  throw new Error(`resolution '${resolutionPath}' does not define digestSelectorTagNameKey`);
}

const tag = resolution.tagNames?.[digestSelectorTagNameKey];
if (!tag) {
  throw new Error(
    `resolution '${resolutionPath}' is missing tag name for digestSelectorTagNameKey '${digestSelectorTagNameKey}'`
  );
}

const database = new Database(dbPath, { readonly: true });
const row = database
  .prepare(
    `
      SELECT m.digest
      FROM package_scans ps
      JOIN tags t
        ON t.scan_id = ps.scan_id
      JOIN manifests m
        ON m.scan_id = t.scan_id
       AND m.version_id = t.version_id
      WHERE ps.status = 'completed'
        AND t.tag = ?
      ORDER BY ps.scan_completed_at DESC, ps.scan_id DESC
      LIMIT 1
    `
  )
  .get(tag);

if (!row) {
  throw new Error(`could not resolve digest selector tag '${tag}' from database '${dbPath}'`);
}

process.stdout.write(`${row.digest}\n`);
