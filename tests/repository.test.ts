import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../src/database.js";
import { Repository } from "../src/repository.js";
import { loadSnapshotFromFile } from "../src/snapshot-source.js";
import { buildPlanSummary } from "../src/planner.js";

test("repository imports snapshot and planner keeps tagged graph while exposing old untagged versions", async () => {
  const tempDirectory = mkdtempSync(join(tmpdir(), "ghcr-manager-"));
  const databasePath = join(tempDirectory, "scan.sqlite");

  try {
    const database = openDatabase(databasePath);
    const repository = new Repository(database);
    const snapshot = await loadSnapshotFromFile("tests/fixtures/sample-package.json");

    repository.replaceSnapshot(snapshot);

    assert.equal(repository.countPackageVersions(), 5);
    assert.equal(repository.countTaggedVersions(), 2);

    const summary = buildPlanSummary(repository, {
      olderThanDays: 30,
      deleteUntagged: true,
      excludeTags: ["keep-me"],
    });

    assert.equal(summary.packageName, "acme/example");
    assert.deepEqual(summary.protectedVersionIds, [101, 102, 103, 105]);
    assert.deepEqual(summary.deletableVersionIds, [104]);

    database.close();
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
});
