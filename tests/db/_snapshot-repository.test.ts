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

    database.close();
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
});
