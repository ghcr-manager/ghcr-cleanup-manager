import assert from "node:assert/strict";
import test from "node:test";
import { PlannerRepository, ScanWriter, openDatabase } from "../../src/db/index.js";
import { importFileScan } from "../helpers/index.js";

test("planner repository returns a delete-untagged plan for top-level untagged roots only", async () => {
  const database = openDatabase(":memory:");
  const writer = new ScanWriter(database);
  const repository = new PlannerRepository(database);

  await importFileScan("tests/fixtures/sample-package.json", writer);

  const plan = repository.getDeleteUntaggedPlan("acme", "example");

  assert.deepEqual(plan.directTargetTags, []);
  assert.deepEqual(plan.directTargetRoots, [
    {
      versionId: 104,
      digest: "sha256:untagged-old",
      manifestKind: "image_manifest",
      reason: "delete-untagged",
      selectionMode: "delete-root"
    }
  ]);
  assert.deepEqual(plan.blockedRoots, []);
  assert.deepEqual(plan.fullyDeletableRoots, plan.directTargetRoots);
  assert.deepEqual(plan.collateralTags, []);
  assert.deepEqual(plan.closureManifests, [
    {
      sourceVersionId: 104,
      sourceDigest: "sha256:untagged-old",
      memberVersionId: 104,
      memberDigest: "sha256:untagged-old",
      memberManifestKind: "image_manifest",
      hopsFromRoot: 0,
      memberRole: "root"
    }
  ]);

  database.close();
});

test("planner repository blocks delete-untagged roots whose closure overlaps retained roots", () => {
  const database = openDatabase(":memory:");
  const writer = new ScanWriter(database);
  const repository = new PlannerRepository(database);

  writer.resetScan("acme", "overlap", "2026-05-14T10:00:00.000Z");
  writer.insertPackageVersion({
    versionId: 1,
    createdAt: "2026-05-01T10:00:00.000Z",
    updatedAt: "2026-05-01T10:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 1,
    digest: "sha256:tagged-root",
    manifestKind: "image_index",
    mediaType: "application/vnd.oci.image.index.v1+json"
  });
  writer.insertTag({
    tag: "latest",
    versionId: 1
  });
  writer.insertPackageVersion({
    versionId: 2,
    createdAt: "2026-04-01T10:00:00.000Z",
    updatedAt: "2026-04-01T10:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 2,
    digest: "sha256:untagged-root",
    manifestKind: "image_index",
    mediaType: "application/vnd.oci.image.index.v1+json"
  });
  writer.insertPackageVersion({
    versionId: 3,
    createdAt: "2026-03-01T10:00:00.000Z",
    updatedAt: "2026-03-01T10:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 3,
    digest: "sha256:shared-child",
    manifestKind: "image_manifest",
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });
  writer.insertManifestEdge({
    parentDigest: "sha256:tagged-root",
    childDigest: "sha256:shared-child",
    edgeKind: "image-child"
  });
  writer.insertManifestEdge({
    parentDigest: "sha256:untagged-root",
    childDigest: "sha256:shared-child",
    edgeKind: "image-child"
  });
  writer.rebuildManifestReachability();
  writer.markScanCompleted("2026-05-14T10:00:00.000Z");

  const plan = repository.getDeleteUntaggedPlan("acme", "overlap");

  assert.deepEqual(plan.directTargetRoots, [
    {
      versionId: 2,
      digest: "sha256:untagged-root",
      manifestKind: "image_index",
      reason: "delete-untagged",
      selectionMode: "delete-root"
    }
  ]);
  assert.deepEqual(plan.blockedRoots, [
    {
      blockedVersionId: 2,
      blockedDigest: "sha256:untagged-root",
      blockingVersionId: 1,
      blockingDigest: "sha256:tagged-root",
      overlapDigest: "sha256:shared-child",
      overlapManifestKind: "image_manifest",
      reason: "overlap-with-retained-root"
    }
  ]);
  assert.deepEqual(plan.fullyDeletableRoots, []);

  database.close();
});

test("planner repository expands multi-arch child manifests and referrers into a fully deletable closure", () => {
  const database = openDatabase(":memory:");
  const writer = new ScanWriter(database);
  const repository = new PlannerRepository(database);

  writer.resetScan("acme", "multiarch", "2026-05-14T10:00:00.000Z");
  writer.insertPackageVersion({
    versionId: 1,
    createdAt: "2026-05-01T10:00:00.000Z",
    updatedAt: "2026-05-01T10:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 1,
    digest: "sha256:multiarch-root",
    manifestKind: "image_index",
    mediaType: "application/vnd.oci.image.index.v1+json"
  });
  writer.insertPackageVersion({
    versionId: 2,
    createdAt: "2026-05-01T10:01:00.000Z",
    updatedAt: "2026-05-01T10:01:00.000Z"
  });
  writer.insertManifest({
    versionId: 2,
    digest: "sha256:linux-amd64",
    manifestKind: "image_manifest",
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });
  writer.insertPackageVersion({
    versionId: 3,
    createdAt: "2026-05-01T10:02:00.000Z",
    updatedAt: "2026-05-01T10:02:00.000Z"
  });
  writer.insertManifest({
    versionId: 3,
    digest: "sha256:linux-arm64",
    manifestKind: "image_manifest",
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });
  writer.insertPackageVersion({
    versionId: 4,
    createdAt: "2026-05-01T10:03:00.000Z",
    updatedAt: "2026-05-01T10:03:00.000Z"
  });
  writer.insertManifest({
    versionId: 4,
    digest: "sha256:amd64-attestation",
    manifestKind: "artifact_manifest",
    mediaType: "application/vnd.oci.artifact.manifest.v1+json"
  });
  writer.insertManifestEdge({
    parentDigest: "sha256:multiarch-root",
    childDigest: "sha256:linux-amd64",
    edgeKind: "image-child"
  });
  writer.insertManifestEdge({
    parentDigest: "sha256:multiarch-root",
    childDigest: "sha256:linux-arm64",
    edgeKind: "image-child"
  });
  writer.insertManifestEdge({
    parentDigest: "sha256:linux-amd64",
    childDigest: "sha256:amd64-attestation",
    edgeKind: "referrer"
  });
  writer.rebuildManifestReachability();
  writer.markScanCompleted("2026-05-14T10:00:00.000Z");

  const plan = repository.getDeleteUntaggedPlan("acme", "multiarch");

  assert.deepEqual(plan.directTargetRoots, [
    {
      versionId: 1,
      digest: "sha256:multiarch-root",
      manifestKind: "image_index",
      reason: "delete-untagged",
      selectionMode: "delete-root"
    }
  ]);
  assert.deepEqual(plan.blockedRoots, []);
  assert.deepEqual(plan.fullyDeletableRoots, plan.directTargetRoots);
  assert.deepEqual(plan.closureManifests, [
    {
      sourceVersionId: 1,
      sourceDigest: "sha256:multiarch-root",
      memberVersionId: 1,
      memberDigest: "sha256:multiarch-root",
      memberManifestKind: "image_index",
      hopsFromRoot: 0,
      memberRole: "root"
    },
    {
      sourceVersionId: 1,
      sourceDigest: "sha256:multiarch-root",
      memberVersionId: 2,
      memberDigest: "sha256:linux-amd64",
      memberManifestKind: "image_manifest",
      hopsFromRoot: 1,
      memberRole: "descendant"
    },
    {
      sourceVersionId: 1,
      sourceDigest: "sha256:multiarch-root",
      memberVersionId: 3,
      memberDigest: "sha256:linux-arm64",
      memberManifestKind: "image_manifest",
      hopsFromRoot: 1,
      memberRole: "descendant"
    },
    {
      sourceVersionId: 1,
      sourceDigest: "sha256:multiarch-root",
      memberVersionId: 4,
      memberDigest: "sha256:amd64-attestation",
      memberManifestKind: "artifact_manifest",
      hopsFromRoot: 2,
      memberRole: "descendant"
    }
  ]);

  database.close();
});

test("planner repository does not treat sibling wrapper indexes as overlapping when they reach different children", () => {
  const database = openDatabase(":memory:");
  const writer = new ScanWriter(database);
  const repository = new PlannerRepository(database);

  writer.resetScan("acme", "siblings", "2026-05-14T10:00:00.000Z");
  writer.insertPackageVersion({
    versionId: 1,
    createdAt: "2026-05-01T10:00:00.000Z",
    updatedAt: "2026-05-01T10:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 1,
    digest: "sha256:tagged-wrapper",
    manifestKind: "image_index",
    mediaType: "application/vnd.oci.image.index.v1+json"
  });
  writer.insertTag({
    tag: "single-amd64",
    versionId: 1
  });
  writer.insertPackageVersion({
    versionId: 2,
    createdAt: "2026-05-01T10:01:00.000Z",
    updatedAt: "2026-05-01T10:01:00.000Z"
  });
  writer.insertManifest({
    versionId: 2,
    digest: "sha256:untagged-wrapper",
    manifestKind: "image_index",
    mediaType: "application/vnd.oci.image.index.v1+json"
  });
  writer.insertPackageVersion({
    versionId: 3,
    createdAt: "2026-05-01T10:02:00.000Z",
    updatedAt: "2026-05-01T10:02:00.000Z"
  });
  writer.insertManifest({
    versionId: 3,
    digest: "sha256:amd64-child",
    manifestKind: "image_manifest",
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });
  writer.insertPackageVersion({
    versionId: 4,
    createdAt: "2026-05-01T10:03:00.000Z",
    updatedAt: "2026-05-01T10:03:00.000Z"
  });
  writer.insertManifest({
    versionId: 4,
    digest: "sha256:arm64-child",
    manifestKind: "image_manifest",
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });
  writer.insertManifestEdge({
    parentDigest: "sha256:tagged-wrapper",
    childDigest: "sha256:amd64-child",
    edgeKind: "image-child"
  });
  writer.insertManifestEdge({
    parentDigest: "sha256:untagged-wrapper",
    childDigest: "sha256:arm64-child",
    edgeKind: "image-child"
  });
  writer.rebuildManifestReachability();
  writer.markScanCompleted("2026-05-14T10:00:00.000Z");

  const plan = repository.getDeleteUntaggedPlan("acme", "siblings");

  assert.deepEqual(plan.directTargetRoots, [
    {
      versionId: 2,
      digest: "sha256:untagged-wrapper",
      manifestKind: "image_index",
      reason: "delete-untagged",
      selectionMode: "delete-root"
    }
  ]);
  assert.deepEqual(plan.blockedRoots, []);
  assert.deepEqual(plan.fullyDeletableRoots, plan.directTargetRoots);
  assert.deepEqual(plan.closureManifests, [
    {
      sourceVersionId: 2,
      sourceDigest: "sha256:untagged-wrapper",
      memberVersionId: 2,
      memberDigest: "sha256:untagged-wrapper",
      memberManifestKind: "image_index",
      hopsFromRoot: 0,
      memberRole: "root"
    },
    {
      sourceVersionId: 2,
      sourceDigest: "sha256:untagged-wrapper",
      memberVersionId: 4,
      memberDigest: "sha256:arm64-child",
      memberManifestKind: "image_manifest",
      hopsFromRoot: 1,
      memberRole: "descendant"
    }
  ]);

  database.close();
});
