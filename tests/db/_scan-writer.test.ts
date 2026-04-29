import assert from "node:assert/strict";
import test from "node:test";
import { openDatabase, ScanWriter, SnapshotRepository } from "../../src/db/index.js";

test("scan writer stores scan metadata and rows incrementally", () => {
  const database = openDatabase(":memory:");
  const writer = new ScanWriter(database);
  const repository = new SnapshotRepository(database);

  writer.resetScan("acme/example", "2026-04-20T12:00:00.000Z");
  writer.insertPackageVersion({
    versionId: 1,
    digest: "sha256:index",
    createdAt: "2026-04-20T10:00:00.000Z",
    updatedAt: "2026-04-20T10:00:00.000Z",
  });
  writer.insertTag({
    tag: "latest",
    digest: "sha256:index",
    versionId: 1,
  });
  writer.insertManifest({
    digest: "sha256:index",
    mediaType: "application/vnd.oci.image.index.v1+json",
  });
  writer.insertManifest({
    digest: "sha256:child",
    mediaType: "application/vnd.oci.image.manifest.v1+json",
  });
  writer.insertManifestEdge({
    parentDigest: "sha256:index",
    childDigest: "sha256:child",
    edgeKind: "image-child",
  });
  writer.rebuildManifestReachability();
  writer.markScanCompleted("2026-04-20T12:00:01.000Z");
  const scanId = writer.getActiveScanId();

  assert.equal(repository.getPackageMetadata(scanId).packageName, "acme/example");
  assert.equal(repository.countPackageVersions(scanId), 1);
  assert.equal(repository.countTags(scanId), 1);
  assert.equal(repository.countManifests(scanId), 2);
  assert.equal(repository.countManifestEdges(scanId), 1);
  assert.equal(
    (database.prepare("SELECT COUNT(*) AS total FROM manifest_reachability").get() as { total: number }).total,
    3,
  );

  database.close();
});
