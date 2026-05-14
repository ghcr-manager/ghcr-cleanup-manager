import assert from "node:assert/strict";
import test from "node:test";
import { openDatabase, ScanWriter, SnapshotRepository } from "../../src/db/index.js";

test("scan writer stores scan metadata and rows incrementally", () => {
  const database = openDatabase(":memory:");
  const writer = new ScanWriter(database);
  const repository = new SnapshotRepository(database);

  writer.resetScan("acme", "example", "2026-04-20T12:00:00.000Z");
  writer.insertPackageVersion({
    versionId: 1,
    createdAt: "2026-04-20T10:00:00.000Z",
    updatedAt: "2026-04-20T10:00:00.000Z"
  });
  writer.insertTag({
    tag: "latest",
    versionId: 1
  });
  writer.insertManifest({
    versionId: 1,
    digest: "sha256:index",
    manifestKind: "image_index",
    mediaType: "application/vnd.oci.image.index.v1+json"
  });
  writer.insertPackageVersion({
    versionId: 2,
    createdAt: "2026-04-20T10:00:00.000Z",
    updatedAt: "2026-04-20T10:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 2,
    digest: "sha256:child",
    manifestKind: "image_manifest",
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });
  writer.insertManifestEdge({
    parentDigest: "sha256:index",
    childDigest: "sha256:child",
    edgeKind: "image-child"
  });
  writer.rebuildManifestReachability();
  writer.markScanCompleted("2026-04-20T12:00:01.000Z");
  const scanId = writer.getActiveScanId();

  const metadata = repository.getPackageMetadata(scanId);
  assert.equal(metadata.owner, "acme");
  assert.equal(metadata.packageName, "example");
  assert.equal(repository.countPackageVersions(scanId), 2);
  assert.equal(repository.countTags(scanId), 1);
  assert.equal(repository.countManifests(scanId), 2);
  assert.equal(repository.countManifestEdges(scanId), 1);
  assert.equal(
    (database.prepare("SELECT COUNT(*) AS total FROM manifest_reachability").get() as { total: number }).total,
    3
  );

  database.close();
});

test("markScanFailed records failed status and completion timestamp", () => {
  const database = openDatabase(":memory:");
  const writer = new ScanWriter(database);

  writer.resetScan("acme", "example", "2026-04-20T12:00:00.000Z");
  writer.markScanFailed("2026-04-20T12:00:42.000Z");
  const scanId = writer.getActiveScanId();

  const scanRow = database
    .prepare(
      `
        SELECT owner, package_name, scan_uuid, status, scan_completed_at
        FROM package_scans
        WHERE scan_id = ?
      `
    )
    .get(scanId) as {
    owner: string;
    package_name: string;
    scan_uuid: string;
    status: string;
    scan_completed_at: string | null;
  };

  assert.equal(scanRow.owner, "acme");
  assert.equal(scanRow.package_name, "example");
  assert.match(scanRow.scan_uuid, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.equal(scanRow.status, "failed");
  assert.equal(scanRow.scan_completed_at, "2026-04-20T12:00:42.000Z");

  database.close();
});
