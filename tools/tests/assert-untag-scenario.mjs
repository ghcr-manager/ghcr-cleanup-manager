#!/usr/bin/env node
/* global process */

import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { untagScenarios } from "./untag-scenarios/_definitions.mjs";

const scenarioId = process.argv[2];
const dbPath = process.argv[3];

if (!scenarioId || !dbPath) {
  throw new Error("usage: node tools/tests/assert-untag-scenario.mjs <scenario> <db-path>");
}

const scenario = untagScenarios[scenarioId];
if (!scenario) {
  throw new Error(`unknown untag scenario: ${scenarioId}`);
}

const tagNames = Object.fromEntries(
  Object.entries(scenario.tagNames ?? {}).map(([key, value]) => [key, `${scenario.id}--${value}`])
);
const deleteTag = tagNames.deleteTag;
assert.ok(deleteTag, `untag scenario '${scenarioId}' is missing a deleteTag tag name`);

const database = new Database(dbPath, { readonly: true });
const latestScanCount = database.prepare("SELECT count(*) AS count FROM v_latest_scan_per_package").get();
assert.ok(latestScanCount && latestScanCount.count > 0, `database '${dbPath}' did not contain a latest package scan`);

const deletedTagRow = database
  .prepare(
    `
      SELECT 1
      FROM tags t
      JOIN v_latest_scan_per_package latest_scan
        ON latest_scan.scan_id = t.scan_id
      WHERE t.tag = ?
      LIMIT 1
    `
  )
  .get(deleteTag);

assert.equal(deletedTagRow, undefined, `tag '${deleteTag}' was still present after untag`);

for (const [tagNameKey, tag] of Object.entries(tagNames)) {
  if (tagNameKey === "deleteTag") {
    continue;
  }

  const retainedTagRow = database
    .prepare(
      `
        SELECT 1
        FROM tags t
        JOIN v_latest_scan_per_package latest_scan
          ON latest_scan.scan_id = t.scan_id
        WHERE t.tag = ?
        LIMIT 1
      `
    )
    .get(tag);

  assert.ok(retainedTagRow, `tag '${tag}' was not present after untag`);
}

process.stdout.write(`Verified direct untag assertions for scenario '${scenarioId}'.\n`);
