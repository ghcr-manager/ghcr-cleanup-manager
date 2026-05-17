import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openDatabase, ScanWriter, SnapshotRepository } from "../../src/db/index.js";
import { importFileScan } from "../helpers/index.js";

test("snapshot repository exposes counts and metadata after import", async () => {
  const tempDirectory = mkdtempSync(join(tmpdir(), "ghcr-manager-"));
  const databasePath = join(tempDirectory, "scan.sqlite");

  try {
    const database = openDatabase(databasePath);
    const writer = new ScanWriter(database);
    const repository = new SnapshotRepository(database);
    await importFileScan("tests/fixtures/sample-package.json", writer);
    const scanId = writer.getActiveScanId();

    assert.equal(repository.countPackageVersions(scanId), 5);
    assert.equal(repository.countTaggedVersions(scanId), 2);
    assert.equal(repository.countTags(scanId), 2);
    const metadata = repository.getPackageMetadata(scanId);
    assert.equal(metadata.owner, "acme");
    assert.equal(metadata.packageName, "example");
    assert.equal(metadata.isPublic, false);

    database.close();
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
});

test("snapshot repository detects whether any package scan was non-public", async () => {
  const tempDirectory = mkdtempSync(join(tmpdir(), "ghcr-manager-"));
  const databasePath = join(tempDirectory, "scan.sqlite");

  try {
    const database = openDatabase(databasePath);
    const writer = new ScanWriter(database);
    const repository = new SnapshotRepository(database);
    await importFileScan("tests/fixtures/sample-package.json", writer);

    writer.resetScan("acme", "example", "2026-05-17T00:00:00.000Z");
    writer.setPackageIsPublic(true);
    writer.markScanCompleted("2026-05-17T00:00:00.000Z");

    assert.equal(repository.hasAnyNonPublicPackageScan("acme", "example"), true);
    assert.equal(repository.hasAnyNonPublicPackageScan("acme", "missing"), false);

    writer.resetScan("acme", "public-only", "2026-05-17T00:00:01.000Z");
    writer.setPackageIsPublic(true);
    writer.markScanCompleted("2026-05-17T00:00:01.000Z");

    assert.equal(repository.hasAnyNonPublicPackageScan("acme", "public-only"), false);

    writer.resetScan("acme", "running-private", "2026-05-17T00:00:02.000Z");
    writer.setPackageIsPublic(false);

    assert.equal(repository.hasAnyNonPublicPackageScan("acme", "running-private"), true);

    database.close();
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
});
