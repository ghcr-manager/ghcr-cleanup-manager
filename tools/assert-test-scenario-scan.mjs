#!/usr/bin/env node

import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { scenarios } from "./test-scenarios/_definitions.mjs";

const scenarioId = process.argv[2];
const dbPath = process.argv[3];

if (!scenarioId || !dbPath) {
  throw new Error("usage: node tools/assert-test-scenario-scan.mjs <scenario> <db-path>");
}

const scenario = scenarios[scenarioId];
if (!scenario) {
  throw new Error(`unknown scenario: ${scenarioId}`);
}

const scanAssertions = scenario.scanAssertions ?? [];
if (scanAssertions.length === 0) {
  process.stdout.write(`No scan assertions configured for scenario '${scenarioId}'.\n`);
  process.exit(0);
}

const tagNames = Object.fromEntries(
  Object.entries(scenario.tagNames ?? {}).map(([key, value]) => [key, `${scenario.id}--${value}`])
);
const database = new Database(dbPath, { readonly: true });

const latestScan = database
  .prepare(
    `
      SELECT scan_id
      FROM package_scans
      WHERE status = 'completed'
      ORDER BY scan_id DESC
      LIMIT 1
    `
  )
  .get();

assert.ok(latestScan, `database '${dbPath}' did not contain a completed package scan`);

for (const scanAssertion of scanAssertions) {
  const tag = tagNames[scanAssertion.tagNameKey];
  assert.ok(tag, `scenario '${scenarioId}' is missing tag '${scanAssertion.tagNameKey}' for scan assertions`);

  const row = database
    .prepare(
      `
        SELECT
          t.tag,
          m.manifest_kind,
          mp.raw_json,
          roots.has_ancestor
        FROM tags t
        JOIN manifests m
          ON m.scan_id = t.scan_id
         AND m.version_id = t.version_id
        JOIN manifest_payloads mp
          ON mp.scan_id = m.scan_id
         AND mp.digest = m.digest
        JOIN v_scan_root_manifests roots
          ON roots.scan_id = m.scan_id
         AND roots.root_version_id = m.version_id
        WHERE t.scan_id = ?
          AND t.tag = ?
      `
    )
    .get(latestScan.scan_id, tag);

  assert.ok(row, `scan ${latestScan.scan_id} did not contain tagged manifest '${tag}'`);

  if (scanAssertion.requireRoot) {
    assert.equal(row.has_ancestor, 0, `tag '${tag}' did not resolve to a root manifest`);
  }

  if (scanAssertion.expectedManifestKind) {
    assert.equal(
      row.manifest_kind,
      scanAssertion.expectedManifestKind,
      `tag '${tag}' resolved to unexpected manifest kind`
    );
  }

  if (scanAssertion.expectedManifestMediaType) {
    const payload = JSON.parse(row.raw_json);
    assert.equal(
      payload.mediaType,
      scanAssertion.expectedManifestMediaType,
      `tag '${tag}' resolved to unexpected manifest payload media type`
    );
  }
}

process.stdout.write(`Verified ${scanAssertions.length} scan assertion(s) for scenario '${scenarioId}'.\n`);
