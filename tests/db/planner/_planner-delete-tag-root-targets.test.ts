import assert from "node:assert/strict";
import test from "node:test";
import { PlannerRepository, ScanWriter, openDatabase } from "../../../src/db/index.js";

test("planner repository resolves delete-tag root targets through the dedicated delete-tag helper", () => {
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
    digest: "sha256:release-root",
    manifestKind: "image_manifest",
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });
  writer.insertTag({ tag: "release-1", versionId: 1 });
  writer.insertTag({ tag: "stable", versionId: 1 });
  writer.markScanCompleted("2026-05-14T10:00:00.000Z");

  const plan = repository.getDeleteTagsPlan("acme", "pkg", ["release-*"], []);

  assert.deepEqual(plan.directTargetRoots, [
    {
      versionId: 1,
      digest: "sha256:release-root",
      manifestKind: "image_manifest",
      reason: "delete-tags-partial-tag-match",
      selectionMode: "untag-only"
    }
  ]);

  database.close();
});
