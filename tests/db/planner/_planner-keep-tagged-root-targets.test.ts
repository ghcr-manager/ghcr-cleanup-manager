import assert from "node:assert/strict";
import test from "node:test";
import { PlannerRepository, ScanWriter, openDatabase } from "../../../src/db/index.js";

test("planner repository resolves keep-tagged root targets through the dedicated keep-tagged helper", () => {
  const database = openDatabase(":memory:");
  const writer = new ScanWriter(database);
  const repository = new PlannerRepository(database);

  writer.resetScan("acme", "pkg", "2026-05-14T10:00:00.000Z");
  writer.insertPackageVersion({
    versionId: 1,
    createdAt: "2026-05-03T10:00:00.000Z",
    updatedAt: "2026-05-03T10:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 1,
    digest: "sha256:newer-root",
    manifestKind: "image_manifest",
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });
  writer.insertTag({ tag: "latest", versionId: 1 });
  writer.insertPackageVersion({
    versionId: 2,
    createdAt: "2026-05-02T10:00:00.000Z",
    updatedAt: "2026-05-02T10:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 2,
    digest: "sha256:older-root",
    manifestKind: "image_manifest",
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });
  writer.insertTag({ tag: "old", versionId: 2 });
  writer.markScanCompleted("2026-05-14T10:00:00.000Z");

  const plan = repository.getKeepNTaggedPlan("acme", "pkg", 1);

  assert.deepEqual(plan.directTargetRoots, [
    {
      versionId: 2,
      digest: "sha256:older-root",
      manifestKind: "image_manifest",
      reason: "keep-n-tagged-overflow",
      selectionMode: "delete-root"
    }
  ]);

  database.close();
});
