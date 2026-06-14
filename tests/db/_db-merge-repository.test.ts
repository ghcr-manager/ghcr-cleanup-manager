import assert from "node:assert/strict";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ManifestKinds } from "../../src/core/index.js";
import {
  CleanupRunWriter,
  DbMergeRepository,
  SnapshotRepository,
  ScanWriter,
  openDatabase
} from "../../src/db/index.js";
import type { DeletePlan } from "../../src/db/index.js";

function _createPlan(scanCompletedAt: string): DeletePlan {
  return {
    owner: "acme",
    packageName: "example",
    scanCompletedAt,
    plannerInputs: {
      deleteUntagged: true,
      deleteTags: [],
      excludeTags: []
    },
    directTargetTags: [],
    directTargetRoots: [],
    rootDecisions: [],
    protectedRoots: [],
    closureManifests: [],
    blockedRoots: [],
    fullyDeletableRoots: [],
    collateralTags: []
  };
}

function _seedDatabase(databasePath: string, cleanupStartedAtTimestamps: string[]): void {
  const database = openDatabase(databasePath);
  const scanWriter = new ScanWriter(database);

  scanWriter.startScan("acme", "example", "2026-05-17T09:00:00.000Z", {
    rawJson: JSON.stringify({ visibility: "private" })
  });
  scanWriter.insertPackageVersion({
    versionId: 101,
    createdAt: "2026-05-17T08:00:00.000Z",
    updatedAt: "2026-05-17T08:00:00.000Z"
  });
  scanWriter.insertManifest({
    versionId: 101,
    digest: "sha256:root",
    mediaType: "application/vnd.oci.image.manifest.v1+json",
    manifestKind: ManifestKinds.imageManifest
  });
  scanWriter.insertTag({
    tag: "latest",
    versionId: 101
  });
  scanWriter.markScanCompleted("2026-05-17T09:00:00.000Z");
  database.close();

  for (const cleanupStartedAt of cleanupStartedAtTimestamps) {
    _appendCleanupRun(databasePath, cleanupStartedAt);
  }
}

function _appendCleanupRun(databasePath: string, cleanupStartedAt: string): void {
  const database = openDatabase(databasePath);
  const cleanupRunWriter = new CleanupRunWriter(database);
  const scanId = Number(
    (
      database
        .prepare(
          `
            SELECT scan_id
            FROM package_scans
            ORDER BY scan_id DESC
            LIMIT 1
          `
        )
        .get() as { scan_id: number }
    ).scan_id
  );
  cleanupRunWriter.persistCleanupRun(scanId, _createPlan("2026-05-17T09:00:00.000Z"), {
    dryRun: true,
    cleanupStartedAt
  });
  database.close();
}

test("db merge repository imports a new scan subtree and attached cleanup runs", () => {
  const tempDirectory = mkdtempSync(join(tmpdir(), "ghcr-cleanup-manager-"));
  const targetDatabasePath = join(tempDirectory, "target.sqlite");
  const sourceDatabasePath = join(tempDirectory, "source.sqlite");
  _seedDatabase(sourceDatabasePath, ["2026-05-17T09:01:00.000Z"]);

  const targetDatabase = openDatabase(targetDatabasePath);
  const merger = new DbMergeRepository(targetDatabase);
  const summary = merger.mergeSourceDatabase(sourceDatabasePath);
  const repository = new SnapshotRepository(targetDatabase);

  try {
    const metadata = repository.getPackageMetadata(1);
    const cleanupRuns = targetDatabase
      .prepare("SELECT cleanup_uuid FROM cleanup_runs ORDER BY cleanup_run_id")
      .all() as Array<{
      cleanup_uuid: string;
    }>;

    assert.equal(summary.importedScanCount, 1);
    assert.equal(summary.skippedScanCount, 0);
    assert.equal(summary.importedCleanupRunCount, 1);
    assert.equal(metadata.owner, "acme");
    assert.equal(repository.countPackageVersions(1), 1);
    assert.equal(repository.countTags(1), 1);
    assert.equal(repository.countManifests(1), 1);
    assert.equal(cleanupRuns.length, 1);
  } finally {
    targetDatabase.close();
    rmSync(tempDirectory, { recursive: true, force: true });
  }
});

test("db merge repository imports only the missing cleanup suffix for an existing scan", () => {
  const tempDirectory = mkdtempSync(join(tmpdir(), "ghcr-cleanup-manager-"));
  const baseDatabasePath = join(tempDirectory, "base.sqlite");
  const targetDatabasePath = join(tempDirectory, "target.sqlite");
  const sourceDatabasePath = join(tempDirectory, "source.sqlite");
  _seedDatabase(baseDatabasePath, ["2026-05-17T09:01:00.000Z"]);
  cpSync(baseDatabasePath, targetDatabasePath);
  cpSync(baseDatabasePath, sourceDatabasePath);
  _appendCleanupRun(sourceDatabasePath, "2026-05-17T09:02:00.000Z");

  const targetDatabase = openDatabase(targetDatabasePath);
  const merger = new DbMergeRepository(targetDatabase);

  try {
    const summary = merger.mergeSourceDatabase(sourceDatabasePath);
    const cleanupRuns = targetDatabase
      .prepare("SELECT cleanup_uuid FROM cleanup_runs ORDER BY cleanup_run_id")
      .all() as Array<{
      cleanup_uuid: string;
    }>;

    assert.equal(summary.importedScanCount, 0);
    assert.equal(summary.skippedScanCount, 1);
    assert.equal(summary.importedCleanupRunCount, 1);
    assert.equal(cleanupRuns.length, 2);
  } finally {
    targetDatabase.close();
    rmSync(tempDirectory, { recursive: true, force: true });
  }
});

test("db merge repository rejects divergent cleanup history for the same scan", () => {
  const tempDirectory = mkdtempSync(join(tmpdir(), "ghcr-cleanup-manager-"));
  const baseDatabasePath = join(tempDirectory, "base.sqlite");
  const targetDatabasePath = join(tempDirectory, "target.sqlite");
  const sourceDatabasePath = join(tempDirectory, "source.sqlite");
  _seedDatabase(baseDatabasePath, ["2026-05-17T09:01:00.000Z"]);
  cpSync(baseDatabasePath, targetDatabasePath);
  cpSync(baseDatabasePath, sourceDatabasePath);
  _appendCleanupRun(targetDatabasePath, "2026-05-17T09:02:00.000Z");
  _appendCleanupRun(sourceDatabasePath, "2026-05-17T09:03:00.000Z");

  const targetDatabase = openDatabase(targetDatabasePath);
  const merger = new DbMergeRepository(targetDatabase);

  try {
    assert.throws(() => merger.mergeSourceDatabase(sourceDatabasePath), /cleanup history diverged for scan_uuid/);
  } finally {
    targetDatabase.close();
    rmSync(tempDirectory, { recursive: true, force: true });
  }
});

test("db merge repository rejects merging a database into itself", () => {
  const tempDirectory = mkdtempSync(join(tmpdir(), "ghcr-cleanup-manager-"));
  const databasePath = join(tempDirectory, "single.sqlite");
  _seedDatabase(databasePath, []);
  const database = openDatabase(databasePath);
  const merger = new DbMergeRepository(database);

  try {
    assert.throws(() => merger.mergeSourceDatabase(databasePath), /source DB matches target DB/);
  } finally {
    database.close();
    rmSync(tempDirectory, { recursive: true, force: true });
  }
});

test("db merge repository counts source cleanup runs as skipped when target history is ahead", () => {
  const tempDirectory = mkdtempSync(join(tmpdir(), "ghcr-cleanup-manager-"));
  const baseDatabasePath = join(tempDirectory, "base.sqlite");
  const targetDatabasePath = join(tempDirectory, "target.sqlite");
  const sourceDatabasePath = join(tempDirectory, "source.sqlite");
  _seedDatabase(baseDatabasePath, ["2026-05-17T09:01:00.000Z"]);
  cpSync(baseDatabasePath, targetDatabasePath);
  cpSync(baseDatabasePath, sourceDatabasePath);
  _appendCleanupRun(targetDatabasePath, "2026-05-17T09:02:00.000Z");

  const targetDatabase = openDatabase(targetDatabasePath);
  const merger = new DbMergeRepository(targetDatabase);

  try {
    const summary = merger.mergeSourceDatabase(sourceDatabasePath);
    assert.equal(summary.importedScanCount, 0);
    assert.equal(summary.skippedScanCount, 1);
    assert.equal(summary.importedCleanupRunCount, 0);
    assert.equal(summary.skippedCleanupRunCount, 1);
  } finally {
    targetDatabase.close();
    rmSync(tempDirectory, { recursive: true, force: true });
  }
});
