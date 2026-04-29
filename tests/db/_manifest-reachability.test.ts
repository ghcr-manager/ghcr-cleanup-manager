import assert from "node:assert/strict";
import test from "node:test";
import { rebuildManifestReachability } from "../../src/db/_manifest-reachability.js";
import { openDatabase, ScanWriter } from "../../src/db/index.js";

test("rebuildManifestReachability builds reachability bottom-up from direct manifest edges", () => {
  const database = openDatabase(":memory:");
  const writer = new ScanWriter(database);

  writer.resetScan("acme/example", "2026-04-20T12:00:00.000Z");
  writer.insertManifest({
    digest: "sha256:index",
    mediaType: "application/vnd.oci.image.index.v1+json",
  });
  writer.insertManifest({
    digest: "sha256:child-a",
    mediaType: "application/vnd.oci.image.manifest.v1+json",
  });
  writer.insertManifest({
    digest: "sha256:child-b",
    mediaType: "application/vnd.oci.image.manifest.v1+json",
  });
  writer.insertManifest({
    digest: "sha256:leaf",
    mediaType: "application/vnd.oci.artifact.manifest.v1+json",
  });
  writer.insertManifestEdge({
    parentDigest: "sha256:index",
    childDigest: "sha256:child-a",
    edgeKind: "image-child",
  });
  writer.insertManifestEdge({
    parentDigest: "sha256:index",
    childDigest: "sha256:child-b",
    edgeKind: "image-child",
  });
  writer.insertManifestEdge({
    parentDigest: "sha256:child-a",
    childDigest: "sha256:leaf",
    edgeKind: "referrer",
  });
  writer.insertManifestEdge({
    parentDigest: "sha256:child-b",
    childDigest: "sha256:leaf",
    edgeKind: "referrer",
  });

  rebuildManifestReachability(database, writer.getActiveScanId());

  const rows = database
    .prepare(
      `
        SELECT ancestor_digest, descendant_digest, min_distance
        FROM manifest_reachability
        ORDER BY ancestor_digest, descendant_digest
      `,
    )
    .all() as Array<{
    ancestor_digest: string;
    descendant_digest: string;
    min_distance: number;
  }>;

  assert.deepEqual(rows, [
    {
      ancestor_digest: "sha256:child-a",
      descendant_digest: "sha256:child-a",
      min_distance: 0,
    },
    {
      ancestor_digest: "sha256:child-a",
      descendant_digest: "sha256:leaf",
      min_distance: 1,
    },
    {
      ancestor_digest: "sha256:child-b",
      descendant_digest: "sha256:child-b",
      min_distance: 0,
    },
    {
      ancestor_digest: "sha256:child-b",
      descendant_digest: "sha256:leaf",
      min_distance: 1,
    },
    {
      ancestor_digest: "sha256:index",
      descendant_digest: "sha256:child-a",
      min_distance: 1,
    },
    {
      ancestor_digest: "sha256:index",
      descendant_digest: "sha256:child-b",
      min_distance: 1,
    },
    {
      ancestor_digest: "sha256:index",
      descendant_digest: "sha256:index",
      min_distance: 0,
    },
    {
      ancestor_digest: "sha256:index",
      descendant_digest: "sha256:leaf",
      min_distance: 2,
    },
    {
      ancestor_digest: "sha256:leaf",
      descendant_digest: "sha256:leaf",
      min_distance: 0,
    },
  ]);

  database.close();
});

test("rebuildManifestReachability rejects cycles in manifest edges", () => {
  const database = openDatabase(":memory:");
  const writer = new ScanWriter(database);

  writer.resetScan("acme/example", "2026-04-20T12:00:00.000Z");
  writer.insertManifest({
    digest: "sha256:a",
    mediaType: "application/vnd.oci.image.manifest.v1+json",
  });
  writer.insertManifest({
    digest: "sha256:b",
    mediaType: "application/vnd.oci.image.manifest.v1+json",
  });
  writer.insertManifestEdge({
    parentDigest: "sha256:a",
    childDigest: "sha256:b",
    edgeKind: "image-child",
  });
  writer.insertManifestEdge({
    parentDigest: "sha256:b",
    childDigest: "sha256:a",
    edgeKind: "image-child",
  });

  assert.throws(() => rebuildManifestReachability(database, writer.getActiveScanId()), /detected a cycle/);

  database.close();
});
