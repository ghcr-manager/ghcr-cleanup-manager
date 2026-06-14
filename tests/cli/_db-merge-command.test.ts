import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { handleDbMerge } from "../../src/cli/_db-merge-command.js";
import { ManifestKinds } from "../../src/core/index.js";
import { ScanWriter, openDatabase } from "../../src/db/index.js";

test("handleDbMerge requires at least one source database", async () => {
  await assert.rejects(() => handleDbMerge(["--db", "target.sqlite"]), /missing required option: --source-db/);
});

test("handleDbMerge merges source databases and prints a summary", async () => {
  const tempDirectory = mkdtempSync(join(tmpdir(), "ghcr-cleanup-manager-"));
  const targetDatabasePath = join(tempDirectory, "target.sqlite");
  const sourceDatabasePath = join(tempDirectory, "source.sqlite");
  const sourceDatabase = openDatabase(sourceDatabasePath);
  const writer = new ScanWriter(sourceDatabase);

  writer.startScan("acme", "example", "2026-05-17T09:00:00.000Z", {
    rawJson: JSON.stringify({ visibility: "private" })
  });
  writer.insertPackageVersion({
    versionId: 101,
    createdAt: "2026-05-17T08:00:00.000Z",
    updatedAt: "2026-05-17T08:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 101,
    digest: "sha256:root",
    mediaType: "application/vnd.oci.image.manifest.v1+json",
    manifestKind: ManifestKinds.imageManifest
  });
  writer.markScanCompleted("2026-05-17T09:00:00.000Z");
  sourceDatabase.close();

  const originalLog = console.log;
  const writes: string[] = [];
  console.log = (message?: unknown) => {
    writes.push(String(message));
  };

  try {
    assert.equal(await handleDbMerge(["--db", targetDatabasePath, "--source-db", sourceDatabasePath]), 0);
  } finally {
    console.log = originalLog;
  }

  const summary = JSON.parse(writes[0] as string) as {
    importedScanCount: number;
    sourceDatabaseCount: number;
  };
  assert.equal(summary.importedScanCount, 1);
  assert.equal(summary.sourceDatabaseCount, 1);

  rmSync(tempDirectory, { recursive: true, force: true });
});
