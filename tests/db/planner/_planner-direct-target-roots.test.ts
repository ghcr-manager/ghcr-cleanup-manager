import assert from "node:assert/strict";
import test from "node:test";
import { ManifestKinds } from "../../../src/core/index.js";
import { PlannerRepository, ScanWriter, openDatabase } from "../../../src/db/index.js";

test("planner direct target roots can rank tagged and untagged overflow in one SQL pipeline", () => {
  const database = openDatabase(":memory:");
  const writer = new ScanWriter(database);
  const repository = new PlannerRepository(database);

  writer.startScan("acme", "pkg", "2026-05-14T10:00:00.000Z", {
    rawJson: JSON.stringify({ visibility: "private" })
  });

  writer.insertPackageVersion({
    versionId: 1,
    createdAt: "2026-05-13T10:00:00.000Z",
    updatedAt: "2026-05-13T10:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 1,
    digest: "sha256:newer-tagged",
    manifestKind: ManifestKinds.imageManifest,
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });
  writer.insertTag({ tag: "latest", versionId: 1 });

  writer.insertPackageVersion({
    versionId: 2,
    createdAt: "2026-05-12T10:00:00.000Z",
    updatedAt: "2026-05-12T10:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 2,
    digest: "sha256:older-tagged",
    manifestKind: ManifestKinds.imageManifest,
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });
  writer.insertTag({ tag: "stable", versionId: 2 });

  writer.insertPackageVersion({
    versionId: 3,
    createdAt: "2026-05-11T10:00:00.000Z",
    updatedAt: "2026-05-11T10:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 3,
    digest: "sha256:newer-untagged",
    manifestKind: ManifestKinds.imageManifest,
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });

  writer.insertPackageVersion({
    versionId: 4,
    createdAt: "2026-05-10T10:00:00.000Z",
    updatedAt: "2026-05-10T10:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 4,
    digest: "sha256:older-untagged",
    manifestKind: ManifestKinds.imageManifest,
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });

  writer.markScanCompleted("2026-05-14T10:00:00.000Z");

  const directTargets = repository.getCleanupPlanWithCutoff("acme", "pkg", {
    keepNTagged: 1,
    keepNUntagged: 1
  }).directTargetRoots;

  assert.deepEqual(directTargets, [
    {
      versionId: 2,
      digest: "sha256:older-tagged",
      manifestKind: ManifestKinds.imageManifest,
      reason: "keep-n-tagged-overflow",
      selectionMode: "delete-root"
    },
    {
      versionId: 4,
      digest: "sha256:older-untagged",
      manifestKind: ManifestKinds.imageManifest,
      reason: "keep-n-untagged-overflow",
      selectionMode: "delete-root"
    }
  ]);

  database.close();
});

test("planner direct target roots protect excluded tagged roots from keep-n-tagged overflow", () => {
  const database = openDatabase(":memory:");
  const writer = new ScanWriter(database);
  const repository = new PlannerRepository(database);

  writer.startScan("acme", "pkg", "2026-07-24T10:00:00.000Z", {
    rawJson: JSON.stringify({ visibility: "private" })
  });

  writer.insertPackageVersion({
    versionId: 1,
    createdAt: "2026-07-23T10:00:00.000Z",
    updatedAt: "2026-07-23T10:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 1,
    digest: "sha256:newest",
    manifestKind: ManifestKinds.multiArchManifest,
    mediaType: "application/vnd.oci.image.index.v1+json"
  });
  writer.insertTag({ tag: "latest", versionId: 1 });
  writer.insertTag({ tag: "v1", versionId: 1 });
  writer.insertTag({ tag: "v1.1.7", versionId: 1 });

  writer.insertPackageVersion({
    versionId: 2,
    createdAt: "2026-07-22T10:00:00.000Z",
    updatedAt: "2026-07-22T10:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 2,
    digest: "sha256:older",
    manifestKind: ManifestKinds.multiArchManifest,
    mediaType: "application/vnd.oci.image.index.v1+json"
  });
  writer.insertTag({ tag: "v1.1.6", versionId: 2 });

  writer.markScanCompleted("2026-07-24T10:00:00.000Z");

  const directTargets = repository.getCleanupPlanWithCutoff("acme", "pkg", {
    keepNTagged: 1,
    excludeTags: ["^latest$", "^v[0-9]+$", "^v[0-9]+\\.[0-9]+\\.[0-9]+$"],
    useRegex: true
  }).directTargetRoots;

  assert.deepEqual(directTargets, []);

  database.close();
});
