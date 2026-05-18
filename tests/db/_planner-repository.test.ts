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

test("planner repository logs raw SQL statements and params at trace level", async () => {
  const database = openDatabase(":memory:");
  const writer = new ScanWriter(database);
  const traceMessages: string[] = [];
  const debugMessages: string[] = [];
  const repository = new PlannerRepository(database, {
    trace(message: string) {
      traceMessages.push(message);
    },
    debug(message: string) {
      debugMessages.push(message);
    }
  });

  await importFileScan("tests/fixtures/sample-package.json", writer);

  const plan = repository.getDeleteUntaggedPlan("acme", "example");

  assert.equal(plan.directTargetRoots.length, 1);
  assert.ok(
    traceMessages.some((message) => message.includes("SELECT scan_id, owner, package_name, scan_completed_at"))
  );
  assert.ok(traceMessages.some((message) => message.includes('PARAMS: ["acme","example"]')));
  assert.ok(debugMessages.some((message) => message.includes("SQL returned")));

  database.close();
});

test("planner repository keeps the newest eligible untagged roots and selects only overflow roots", () => {
  const database = openDatabase(":memory:");
  const writer = new ScanWriter(database);
  const repository = new PlannerRepository(database);

  writer.resetScan("acme", "keep-untagged", "2026-05-14T10:00:00.000Z");
  writer.insertPackageVersion({
    versionId: 1,
    createdAt: "2026-05-03T10:00:00.000Z",
    updatedAt: "2026-05-03T10:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 1,
    digest: "sha256:newest-untagged",
    manifestKind: "image_manifest",
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });
  writer.insertPackageVersion({
    versionId: 2,
    createdAt: "2026-05-02T10:00:00.000Z",
    updatedAt: "2026-05-02T10:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 2,
    digest: "sha256:middle-untagged",
    manifestKind: "image_manifest",
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });
  writer.insertPackageVersion({
    versionId: 3,
    createdAt: "2026-05-01T10:00:00.000Z",
    updatedAt: "2026-05-01T10:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 3,
    digest: "sha256:oldest-untagged",
    manifestKind: "image_manifest",
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });
  writer.markScanCompleted("2026-05-14T10:00:00.000Z");

  const plan = repository.getKeepNUntaggedPlan("acme", "keep-untagged", 2);

  assert.deepEqual(plan.directTargetTags, []);
  assert.equal(plan.plannerInputs.keepNUntagged, 2);
  assert.deepEqual(plan.directTargetRoots, [
    {
      versionId: 3,
      digest: "sha256:oldest-untagged",
      manifestKind: "image_manifest",
      reason: "keep-n-untagged-overflow",
      selectionMode: "delete-root"
    }
  ]);
  assert.deepEqual(plan.blockedRoots, []);
  assert.deepEqual(plan.fullyDeletableRoots, plan.directTargetRoots);

  database.close();
});

test("planner repository applies older-than before keep-n-untagged recency selection", () => {
  const database = openDatabase(":memory:");
  const writer = new ScanWriter(database);
  const repository = new PlannerRepository(database);

  writer.resetScan("acme", "keep-untagged-age", "2026-05-14T10:00:00.000Z");
  writer.insertPackageVersion({
    versionId: 1,
    createdAt: "2026-05-10T10:00:00.000Z",
    updatedAt: "2026-05-10T10:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 1,
    digest: "sha256:too-new",
    manifestKind: "image_manifest",
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });
  writer.insertPackageVersion({
    versionId: 2,
    createdAt: "2026-04-01T10:00:00.000Z",
    updatedAt: "2026-04-01T10:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 2,
    digest: "sha256:older-kept",
    manifestKind: "image_manifest",
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });
  writer.insertPackageVersion({
    versionId: 3,
    createdAt: "2026-03-01T10:00:00.000Z",
    updatedAt: "2026-03-01T10:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 3,
    digest: "sha256:older-deleted",
    manifestKind: "image_manifest",
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });
  writer.markScanCompleted("2026-05-14T10:00:00.000Z");

  const plan = repository.getKeepNUntaggedPlanWithCutoff("acme", "keep-untagged-age", 1, {
    olderThan: "30 days",
    cutoffTimestamp: "2026-04-14T10:00:00.000Z"
  });

  assert.equal(plan.plannerInputs.olderThan, "30 days");
  assert.equal(plan.plannerInputs.cutoffTimestamp, "2026-04-14T10:00:00.000Z");
  assert.equal(plan.plannerInputs.keepNUntagged, 1);
  assert.deepEqual(plan.directTargetRoots, [
    {
      versionId: 3,
      digest: "sha256:older-deleted",
      manifestKind: "image_manifest",
      reason: "keep-n-untagged-overflow",
      selectionMode: "delete-root"
    }
  ]);

  database.close();
});

test("planner repository carries delete-ghost-images planner metadata through tagged-root planning", () => {
  const database = openDatabase(":memory:");
  const writer = new ScanWriter(database);
  const repository = new PlannerRepository(database);

  writer.resetScan("acme", "ghost-images", "2026-05-15T00:00:00.000Z");
  writer.insertPackageVersion({
    versionId: 201,
    createdAt: "2026-05-10T00:00:00.000Z",
    updatedAt: "2026-05-10T00:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 201,
    digest: "sha256:ghost-index",
    manifestKind: "image_index",
    mediaType: "application/vnd.oci.image.index.v1+json"
  });
  writer.insertTag({
    tag: "ghost",
    versionId: 201
  });
  writer.insertManifestDescriptor({
    parentDigest: "sha256:ghost-index",
    childDigest: "sha256:missing-amd64",
    mediaType: "application/vnd.oci.image.manifest.v1+json",
    platform: { os: "linux", architecture: "amd64" }
  });
  writer.insertManifestDescriptor({
    parentDigest: "sha256:ghost-index",
    childDigest: "sha256:missing-arm64",
    mediaType: "application/vnd.oci.image.manifest.v1+json",
    platform: { os: "linux", architecture: "arm64" }
  });
  writer.rebuildManifestReachability();
  writer.markScanCompleted("2026-05-15T00:00:00.000Z");

  const plan = repository.getDeleteTagsPlanWithCutoff("acme", "ghost-images", ["ghost"], [], {
    deleteGhostImages: true,
    deleteTagsRequested: true
  });

  assert.equal(plan.plannerInputs.deleteGhostImages, true);
  assert.deepEqual(plan.directTargetTags, ["ghost"]);
  assert.deepEqual(plan.directTargetRoots, [
    {
      versionId: 201,
      digest: "sha256:ghost-index",
      manifestKind: "image_index",
      reason: "delete-tags-all-tags-selected",
      selectionMode: "delete-root"
    }
  ]);
  assert.deepEqual(plan.fullyDeletableRoots, plan.directTargetRoots);

  database.close();
});

test("planner repository carries delete-partial-images planner metadata through tagged-root planning", () => {
  const database = openDatabase(":memory:");
  const writer = new ScanWriter(database);
  const repository = new PlannerRepository(database);

  writer.resetScan("acme", "partial-images", "2026-05-15T00:00:00.000Z");
  writer.insertPackageVersion({
    versionId: 201,
    createdAt: "2026-05-10T00:00:00.000Z",
    updatedAt: "2026-05-10T00:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 201,
    digest: "sha256:partial-index",
    manifestKind: "image_index",
    mediaType: "application/vnd.oci.image.index.v1+json"
  });
  writer.insertTag({
    tag: "partial",
    versionId: 201
  });
  writer.insertManifestDescriptor({
    parentDigest: "sha256:partial-index",
    childDigest: "sha256:present-child",
    mediaType: "application/vnd.oci.image.manifest.v1+json",
    platform: { os: "linux", architecture: "amd64" }
  });
  writer.insertManifestDescriptor({
    parentDigest: "sha256:partial-index",
    childDigest: "sha256:missing-arm64",
    mediaType: "application/vnd.oci.image.manifest.v1+json",
    platform: { os: "linux", architecture: "arm64" }
  });
  writer.insertPackageVersion({
    versionId: 202,
    createdAt: "2026-05-11T00:00:00.000Z",
    updatedAt: "2026-05-11T00:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 202,
    digest: "sha256:present-child",
    manifestKind: "image_manifest",
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });
  writer.rebuildManifestReachability();
  writer.markScanCompleted("2026-05-15T00:00:00.000Z");

  const plan = repository.getDeleteTagsPlanWithCutoff("acme", "partial-images", ["partial"], [], {
    deletePartialImages: true,
    deleteTagsRequested: true
  });

  assert.equal(plan.plannerInputs.deletePartialImages, true);
  assert.deepEqual(plan.directTargetTags, ["partial"]);
  assert.deepEqual(plan.directTargetRoots, [
    {
      versionId: 201,
      digest: "sha256:partial-index",
      manifestKind: "image_index",
      reason: "delete-tags-all-tags-selected",
      selectionMode: "delete-root"
    }
  ]);
  assert.deepEqual(plan.fullyDeletableRoots, plan.directTargetRoots);

  database.close();
});

test("planner repository keeps the newest eligible tagged roots and selects only overflow roots", () => {
  const database = openDatabase(":memory:");
  const writer = new ScanWriter(database);
  const repository = new PlannerRepository(database);

  writer.resetScan("acme", "keep-tagged", "2026-05-14T10:00:00.000Z");
  writer.insertPackageVersion({
    versionId: 1,
    createdAt: "2026-05-03T10:00:00.000Z",
    updatedAt: "2026-05-03T10:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 1,
    digest: "sha256:newest-tagged",
    manifestKind: "image_manifest",
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });
  writer.insertTag({
    tag: "latest",
    versionId: 1
  });
  writer.insertPackageVersion({
    versionId: 2,
    createdAt: "2026-05-02T10:00:00.000Z",
    updatedAt: "2026-05-02T10:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 2,
    digest: "sha256:middle-tagged",
    manifestKind: "image_manifest",
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });
  writer.insertTag({
    tag: "beta-new",
    versionId: 2
  });
  writer.insertPackageVersion({
    versionId: 3,
    createdAt: "2026-05-01T10:00:00.000Z",
    updatedAt: "2026-05-01T10:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 3,
    digest: "sha256:oldest-tagged",
    manifestKind: "image_manifest",
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });
  writer.insertTag({
    tag: "stable",
    versionId: 3
  });
  writer.markScanCompleted("2026-05-14T10:00:00.000Z");

  const plan = repository.getKeepNTaggedPlan("acme", "keep-tagged", 2);

  assert.deepEqual(plan.directTargetTags, []);
  assert.equal(plan.plannerInputs.keepNTagged, 2);
  assert.deepEqual(plan.directTargetRoots, [
    {
      versionId: 3,
      digest: "sha256:oldest-tagged",
      manifestKind: "image_manifest",
      reason: "keep-n-tagged-overflow",
      selectionMode: "delete-root"
    }
  ]);
  assert.deepEqual(plan.blockedRoots, []);
  assert.deepEqual(plan.fullyDeletableRoots, plan.directTargetRoots);

  database.close();
});

test("planner repository applies older-than before keep-n-tagged recency selection", () => {
  const database = openDatabase(":memory:");
  const writer = new ScanWriter(database);
  const repository = new PlannerRepository(database);

  writer.resetScan("acme", "keep-tagged-age", "2026-05-14T10:00:00.000Z");
  writer.insertPackageVersion({
    versionId: 1,
    createdAt: "2026-05-10T10:00:00.000Z",
    updatedAt: "2026-05-10T10:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 1,
    digest: "sha256:too-new-tagged",
    manifestKind: "image_manifest",
    mediaType: "application/vnd.oci.image.manifest.v1+json"
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
    digest: "sha256:older-tagged-kept",
    manifestKind: "image_manifest",
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });
  writer.insertTag({
    tag: "beta-new",
    versionId: 2
  });
  writer.insertPackageVersion({
    versionId: 3,
    createdAt: "2026-03-01T10:00:00.000Z",
    updatedAt: "2026-03-01T10:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 3,
    digest: "sha256:older-tagged-deleted",
    manifestKind: "image_manifest",
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });
  writer.insertTag({
    tag: "stable",
    versionId: 3
  });
  writer.markScanCompleted("2026-05-14T10:00:00.000Z");

  const plan = repository.getKeepNTaggedPlanWithCutoff("acme", "keep-tagged-age", 1, [], {
    olderThan: "30 days",
    cutoffTimestamp: "2026-04-14T10:00:00.000Z"
  });

  assert.equal(plan.plannerInputs.olderThan, "30 days");
  assert.equal(plan.plannerInputs.cutoffTimestamp, "2026-04-14T10:00:00.000Z");
  assert.equal(plan.plannerInputs.keepNTagged, 1);
  assert.deepEqual(plan.directTargetRoots, [
    {
      versionId: 3,
      digest: "sha256:older-tagged-deleted",
      manifestKind: "image_manifest",
      reason: "keep-n-tagged-overflow",
      selectionMode: "delete-root"
    }
  ]);

  database.close();
});

test("planner repository applies keep-n-tagged within the matched delete-tag subset", () => {
  const database = openDatabase(":memory:");
  const writer = new ScanWriter(database);
  const repository = new PlannerRepository(database);

  writer.resetScan("acme", "tagged-combined", "2026-05-14T10:00:00.000Z");
  writer.insertPackageVersion({
    versionId: 1,
    createdAt: "2026-05-03T10:00:00.000Z",
    updatedAt: "2026-05-03T10:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 1,
    digest: "sha256:retained-unrelated",
    manifestKind: "image_manifest",
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });
  writer.insertTag({
    tag: "latest",
    versionId: 1
  });
  writer.insertPackageVersion({
    versionId: 2,
    createdAt: "2026-05-02T10:00:00.000Z",
    updatedAt: "2026-05-02T10:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 2,
    digest: "sha256:matched-kept",
    manifestKind: "image_manifest",
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });
  writer.insertTag({
    tag: "beta-new",
    versionId: 2
  });
  writer.insertPackageVersion({
    versionId: 3,
    createdAt: "2026-05-01T10:00:00.000Z",
    updatedAt: "2026-05-01T10:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 3,
    digest: "sha256:matched-deleted",
    manifestKind: "image_manifest",
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });
  writer.insertTag({
    tag: "beta-old",
    versionId: 3
  });
  writer.markScanCompleted("2026-05-14T10:00:00.000Z");

  const plan = repository.getDeleteTagsPlanWithCutoff("acme", "tagged-combined", ["beta-new", "beta-old"], [], {
    keepNTagged: 1
  });

  assert.deepEqual(plan.directTargetTags, ["beta-new", "beta-old"]);
  assert.equal(plan.plannerInputs.keepNTagged, 1);
  assert.deepEqual(plan.directTargetRoots, [
    {
      versionId: 3,
      digest: "sha256:matched-deleted",
      manifestKind: "image_manifest",
      reason: "keep-n-tagged-overflow",
      selectionMode: "delete-root"
    }
  ]);

  database.close();
});

test("planner repository keeps non-matched tags on shared matched roots as untag-only after keep overflow", () => {
  const database = openDatabase(":memory:");
  const writer = new ScanWriter(database);
  const repository = new PlannerRepository(database);

  writer.resetScan("acme", "tagged-combined-partial", "2026-05-14T10:00:00.000Z");
  writer.insertPackageVersion({
    versionId: 1,
    createdAt: "2026-05-03T10:00:00.000Z",
    updatedAt: "2026-05-03T10:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 1,
    digest: "sha256:matched-kept",
    manifestKind: "image_manifest",
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });
  writer.insertTag({
    tag: "beta-new",
    versionId: 1
  });
  writer.insertPackageVersion({
    versionId: 2,
    createdAt: "2026-05-01T10:00:00.000Z",
    updatedAt: "2026-05-01T10:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 2,
    digest: "sha256:matched-shared",
    manifestKind: "image_manifest",
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });
  writer.insertTag({
    tag: "beta-old",
    versionId: 2
  });
  writer.insertTag({
    tag: "alpha",
    versionId: 2
  });
  writer.markScanCompleted("2026-05-14T10:00:00.000Z");

  const plan = repository.getDeleteTagsPlanWithCutoff("acme", "tagged-combined-partial", ["beta-new", "beta-old"], [], {
    keepNTagged: 1
  });

  assert.deepEqual(plan.directTargetTags, ["beta-new", "beta-old"]);
  assert.equal(plan.plannerInputs.keepNTagged, 1);
  assert.deepEqual(plan.directTargetRoots, [
    {
      versionId: 2,
      digest: "sha256:matched-shared",
      manifestKind: "image_manifest",
      reason: "delete-tags-partial-tag-match",
      selectionMode: "untag-only"
    }
  ]);
  assert.deepEqual(plan.fullyDeletableRoots, []);

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
  assert.deepEqual(plan.rootDecisions, [
    {
      versionId: 2,
      digest: "sha256:untagged-root",
      manifestKind: "image_index",
      selectionMode: "delete-root",
      selectionReason: "delete-untagged",
      validationStatus: "blocked",
      validationReasonCode: "blocked-overlap-with-retained-root",
      validationReason:
        "blocked because retained root sha256:tagged-root still requires shared manifest sha256:shared-child",
      blockingVersionId: 1,
      blockingDigest: "sha256:tagged-root",
      overlapDigest: "sha256:shared-child",
      overlapManifestKind: "image_manifest"
    }
  ]);
  assert.deepEqual(plan.protectedRoots, [
    {
      versionId: 1,
      digest: "sha256:tagged-root",
      blocks: [
        {
          blockedVersionId: 2,
          blockedDigest: "sha256:untagged-root",
          blockReasonCode: "overlap-with-retained-root",
          overlapDigest: "sha256:shared-child",
          overlapManifestKind: "image_manifest"
        }
      ]
    }
  ]);
  assert.deepEqual(plan.validationSummary, {
    directTargetTagCount: 0,
    directTargetRootCount: 1,
    deleteRootCandidateCount: 1,
    untagOnlyRootCount: 0,
    fullyDeletableRootCount: 0,
    blockedDeleteRootCount: 1,
    protectedRootCount: 1
  });
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

test("planner repository selects a fully matched tagged root for deletion", () => {
  const database = openDatabase(":memory:");
  const writer = new ScanWriter(database);
  const repository = new PlannerRepository(database);

  writer.resetScan("acme", "delete-tags", "2026-05-14T10:00:00.000Z");
  writer.insertPackageVersion({
    versionId: 1,
    createdAt: "2026-05-01T10:00:00.000Z",
    updatedAt: "2026-05-01T10:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 1,
    digest: "sha256:latest-root",
    manifestKind: "image_manifest",
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });
  writer.insertTag({
    tag: "latest",
    versionId: 1
  });
  writer.markScanCompleted("2026-05-14T10:00:00.000Z");

  const plan = repository.getDeleteTagsPlan("acme", "delete-tags", ["latest"], []);

  assert.deepEqual(plan.directTargetTags, ["latest"]);
  assert.deepEqual(plan.directTargetRoots, [
    {
      versionId: 1,
      digest: "sha256:latest-root",
      manifestKind: "image_manifest",
      reason: "delete-tags-all-tags-selected",
      selectionMode: "delete-root"
    }
  ]);
  assert.deepEqual(plan.closureManifests, [
    {
      sourceVersionId: 1,
      sourceDigest: "sha256:latest-root",
      memberVersionId: 1,
      memberDigest: "sha256:latest-root",
      memberManifestKind: "image_manifest",
      hopsFromRoot: 0,
      memberRole: "root"
    }
  ]);
  assert.deepEqual(plan.blockedRoots, []);
  assert.deepEqual(plan.fullyDeletableRoots, plan.directTargetRoots);

  database.close();
});

test("planner repository matches wildcard tag selectors in SQL", () => {
  const database = openDatabase(":memory:");
  const writer = new ScanWriter(database);
  const repository = new PlannerRepository(database);

  writer.resetScan("acme", "wildcard-tags", "2026-05-14T10:00:00.000Z");
  writer.insertPackageVersion({
    versionId: 1,
    createdAt: "2026-05-01T10:00:00.000Z",
    updatedAt: "2026-05-01T10:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 1,
    digest: "sha256:latest-root",
    manifestKind: "image_manifest",
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });
  writer.insertTag({
    tag: "latest",
    versionId: 1
  });
  writer.markScanCompleted("2026-05-14T10:00:00.000Z");

  const plan = repository.getDeleteTagsPlan("acme", "wildcard-tags", ["l*"], []);

  assert.deepEqual(plan.directTargetTags, ["latest"]);
  assert.deepEqual(plan.directTargetRoots, [
    {
      versionId: 1,
      digest: "sha256:latest-root",
      manifestKind: "image_manifest",
      reason: "delete-tags-all-tags-selected",
      selectionMode: "delete-root"
    }
  ]);

  database.close();
});

test("planner repository matches regex delete and exclude selectors in SQL", () => {
  const database = openDatabase(":memory:");
  const writer = new ScanWriter(database);
  const repository = new PlannerRepository(database);

  writer.resetScan("acme", "regex-tags", "2026-05-14T10:00:00.000Z");
  writer.insertPackageVersion({
    versionId: 1,
    createdAt: "2026-05-01T10:00:00.000Z",
    updatedAt: "2026-05-01T10:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 1,
    digest: "sha256:protected-root",
    manifestKind: "image_manifest",
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });
  writer.insertTag({
    tag: "latest",
    versionId: 1
  });
  writer.insertTag({
    tag: "keep-me",
    versionId: 1
  });
  writer.markScanCompleted("2026-05-14T10:00:00.000Z");

  const plan = repository.getDeleteTagsPlanWithCutoff("acme", "regex-tags", ["^l.*"], [".*me$"], {
    useRegex: true
  });

  assert.deepEqual(plan.directTargetTags, []);
  assert.deepEqual(plan.directTargetRoots, []);

  database.close();
});

test("planner repository keeps partial tag matches as untag-only roots", () => {
  const database = openDatabase(":memory:");
  const writer = new ScanWriter(database);
  const repository = new PlannerRepository(database);

  writer.resetScan("acme", "partial-tags", "2026-05-14T10:00:00.000Z");
  writer.insertPackageVersion({
    versionId: 1,
    createdAt: "2026-05-01T10:00:00.000Z",
    updatedAt: "2026-05-01T10:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 1,
    digest: "sha256:multi-tag-root",
    manifestKind: "image_manifest",
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });
  writer.insertTag({
    tag: "latest",
    versionId: 1
  });
  writer.insertTag({
    tag: "stable",
    versionId: 1
  });
  writer.markScanCompleted("2026-05-14T10:00:00.000Z");

  const plan = repository.getDeleteTagsPlan("acme", "partial-tags", ["latest"], []);

  assert.deepEqual(plan.directTargetTags, ["latest"]);
  assert.deepEqual(plan.directTargetRoots, [
    {
      versionId: 1,
      digest: "sha256:multi-tag-root",
      manifestKind: "image_manifest",
      reason: "delete-tags-partial-tag-match",
      selectionMode: "untag-only"
    }
  ]);
  assert.deepEqual(plan.rootDecisions, [
    {
      versionId: 1,
      digest: "sha256:multi-tag-root",
      manifestKind: "image_manifest",
      selectionMode: "untag-only",
      selectionReason: "delete-tags-partial-tag-match",
      validationStatus: "untag-only",
      validationReasonCode: "untag-only-partial-tag-match",
      validationReason:
        "matched tags cover only part of this root's tag set, so the version is retained and only those tags can be detached"
    }
  ]);
  assert.deepEqual(plan.closureManifests, []);
  assert.deepEqual(plan.blockedRoots, []);
  assert.deepEqual(plan.fullyDeletableRoots, []);

  database.close();
});

test("planner repository lets exclude-tags protect a matched root", () => {
  const database = openDatabase(":memory:");
  const writer = new ScanWriter(database);
  const repository = new PlannerRepository(database);

  writer.resetScan("acme", "exclude-tags", "2026-05-14T10:00:00.000Z");
  writer.insertPackageVersion({
    versionId: 1,
    createdAt: "2026-05-01T10:00:00.000Z",
    updatedAt: "2026-05-01T10:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 1,
    digest: "sha256:protected-root",
    manifestKind: "image_manifest",
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });
  writer.insertTag({
    tag: "latest",
    versionId: 1
  });
  writer.insertTag({
    tag: "keep-me",
    versionId: 1
  });
  writer.markScanCompleted("2026-05-14T10:00:00.000Z");

  const plan = repository.getDeleteTagsPlan("acme", "exclude-tags", ["latest"], ["keep-me"]);

  assert.deepEqual(plan.directTargetTags, []);
  assert.deepEqual(plan.directTargetRoots, []);
  assert.deepEqual(plan.closureManifests, []);
  assert.deepEqual(plan.blockedRoots, []);
  assert.deepEqual(plan.fullyDeletableRoots, []);

  database.close();
});

test("planner repository blocks fully selected tagged roots whose closure overlaps retained roots", () => {
  const database = openDatabase(":memory:");
  const writer = new ScanWriter(database);
  const repository = new PlannerRepository(database);

  writer.resetScan("acme", "tag-overlap", "2026-05-14T10:00:00.000Z");
  writer.insertPackageVersion({
    versionId: 1,
    createdAt: "2026-05-01T10:00:00.000Z",
    updatedAt: "2026-05-01T10:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 1,
    digest: "sha256:delete-root",
    manifestKind: "image_index",
    mediaType: "application/vnd.oci.image.index.v1+json"
  });
  writer.insertTag({
    tag: "pr-123",
    versionId: 1
  });
  writer.insertPackageVersion({
    versionId: 2,
    createdAt: "2026-05-02T10:00:00.000Z",
    updatedAt: "2026-05-02T10:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 2,
    digest: "sha256:retained-root",
    manifestKind: "image_index",
    mediaType: "application/vnd.oci.image.index.v1+json"
  });
  writer.insertTag({
    tag: "latest",
    versionId: 2
  });
  writer.insertPackageVersion({
    versionId: 3,
    createdAt: "2026-05-03T10:00:00.000Z",
    updatedAt: "2026-05-03T10:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 3,
    digest: "sha256:shared-child",
    manifestKind: "image_manifest",
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });
  writer.insertManifestEdge({
    parentDigest: "sha256:delete-root",
    childDigest: "sha256:shared-child",
    edgeKind: "image-child"
  });
  writer.insertManifestEdge({
    parentDigest: "sha256:retained-root",
    childDigest: "sha256:shared-child",
    edgeKind: "image-child"
  });
  writer.rebuildManifestReachability();
  writer.markScanCompleted("2026-05-14T10:00:00.000Z");

  const plan = repository.getDeleteTagsPlan("acme", "tag-overlap", ["pr-123"], []);

  assert.deepEqual(plan.directTargetTags, ["pr-123"]);
  assert.deepEqual(plan.directTargetRoots, [
    {
      versionId: 1,
      digest: "sha256:delete-root",
      manifestKind: "image_index",
      reason: "delete-tags-all-tags-selected",
      selectionMode: "delete-root"
    }
  ]);
  assert.deepEqual(plan.blockedRoots, [
    {
      blockedVersionId: 1,
      blockedDigest: "sha256:delete-root",
      blockingVersionId: 2,
      blockingDigest: "sha256:retained-root",
      overlapDigest: "sha256:shared-child",
      overlapManifestKind: "image_manifest",
      reason: "overlap-with-retained-root"
    }
  ]);
  assert.deepEqual(plan.fullyDeletableRoots, []);

  database.close();
});

test("planner repository applies older-than to delete-untagged root selection", () => {
  const database = openDatabase(":memory:");
  const writer = new ScanWriter(database);
  const repository = new PlannerRepository(database);

  writer.resetScan("acme", "older-untagged", "2026-05-14T10:00:00.000Z");
  writer.insertPackageVersion({
    versionId: 1,
    createdAt: "2026-05-01T10:00:00.000Z",
    updatedAt: "2026-05-01T10:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 1,
    digest: "sha256:young-untagged",
    manifestKind: "image_manifest",
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });
  writer.insertPackageVersion({
    versionId: 2,
    createdAt: "2026-01-01T10:00:00.000Z",
    updatedAt: "2026-01-01T10:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 2,
    digest: "sha256:old-untagged",
    manifestKind: "image_manifest",
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });
  writer.markScanCompleted("2026-05-14T10:00:00.000Z");

  const plan = repository.getDeleteUntaggedPlanWithCutoff("acme", "older-untagged", {
    olderThan: "30 days",
    cutoffTimestamp: "2026-04-14T10:00:00.000Z"
  });

  assert.equal(plan.plannerInputs.olderThan, "30 days");
  assert.equal(plan.plannerInputs.cutoffTimestamp, "2026-04-14T10:00:00.000Z");
  assert.deepEqual(plan.directTargetRoots, [
    {
      versionId: 2,
      digest: "sha256:old-untagged",
      manifestKind: "image_manifest",
      reason: "delete-untagged",
      selectionMode: "delete-root"
    }
  ]);

  database.close();
});

test("planner repository applies older-than to exact tag matches", () => {
  const database = openDatabase(":memory:");
  const writer = new ScanWriter(database);
  const repository = new PlannerRepository(database);

  writer.resetScan("acme", "older-tags", "2026-05-14T10:00:00.000Z");
  writer.insertPackageVersion({
    versionId: 1,
    createdAt: "2026-05-01T10:00:00.000Z",
    updatedAt: "2026-05-01T10:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 1,
    digest: "sha256:young-tagged",
    manifestKind: "image_manifest",
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });
  writer.insertTag({
    tag: "latest",
    versionId: 1
  });
  writer.insertPackageVersion({
    versionId: 2,
    createdAt: "2026-01-01T10:00:00.000Z",
    updatedAt: "2026-01-01T10:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 2,
    digest: "sha256:old-tagged",
    manifestKind: "image_manifest",
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });
  writer.insertTag({
    tag: "latest",
    versionId: 2
  });
  writer.markScanCompleted("2026-05-14T10:00:00.000Z");

  const plan = repository.getDeleteTagsPlanWithCutoff("acme", "older-tags", ["latest"], [], {
    olderThan: "30 days",
    cutoffTimestamp: "2026-04-14T10:00:00.000Z"
  });

  assert.deepEqual(plan.directTargetTags, ["latest"]);
  assert.deepEqual(plan.directTargetRoots, [
    {
      versionId: 2,
      digest: "sha256:old-tagged",
      manifestKind: "image_manifest",
      reason: "delete-tags-all-tags-selected",
      selectionMode: "delete-root"
    }
  ]);

  database.close();
});

test("planner repository keeps older-than partial tag matches as untag-only", () => {
  const database = openDatabase(":memory:");
  const writer = new ScanWriter(database);
  const repository = new PlannerRepository(database);

  writer.resetScan("acme", "older-partial", "2026-05-14T10:00:00.000Z");
  writer.insertPackageVersion({
    versionId: 1,
    createdAt: "2026-01-01T10:00:00.000Z",
    updatedAt: "2026-01-01T10:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 1,
    digest: "sha256:old-multi-tag",
    manifestKind: "image_manifest",
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });
  writer.insertTag({
    tag: "latest",
    versionId: 1
  });
  writer.insertTag({
    tag: "stable",
    versionId: 1
  });
  writer.markScanCompleted("2026-05-14T10:00:00.000Z");

  const plan = repository.getDeleteTagsPlanWithCutoff("acme", "older-partial", ["latest"], [], {
    olderThan: "30 days",
    cutoffTimestamp: "2026-04-14T10:00:00.000Z"
  });

  assert.deepEqual(plan.directTargetRoots, [
    {
      versionId: 1,
      digest: "sha256:old-multi-tag",
      manifestKind: "image_manifest",
      reason: "delete-tags-partial-tag-match",
      selectionMode: "untag-only"
    }
  ]);
  assert.deepEqual(plan.fullyDeletableRoots, []);

  database.close();
});

test("planner repository lets younger retained roots still block older-than delete candidates", () => {
  const database = openDatabase(":memory:");
  const writer = new ScanWriter(database);
  const repository = new PlannerRepository(database);

  writer.resetScan("acme", "older-blocked", "2026-05-14T10:00:00.000Z");
  writer.insertPackageVersion({
    versionId: 1,
    createdAt: "2026-01-01T10:00:00.000Z",
    updatedAt: "2026-01-01T10:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 1,
    digest: "sha256:old-delete-root",
    manifestKind: "image_index",
    mediaType: "application/vnd.oci.image.index.v1+json"
  });
  writer.insertTag({
    tag: "pr-123",
    versionId: 1
  });
  writer.insertPackageVersion({
    versionId: 2,
    createdAt: "2026-05-01T10:00:00.000Z",
    updatedAt: "2026-05-01T10:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 2,
    digest: "sha256:young-retained-root",
    manifestKind: "image_index",
    mediaType: "application/vnd.oci.image.index.v1+json"
  });
  writer.insertTag({
    tag: "latest",
    versionId: 2
  });
  writer.insertPackageVersion({
    versionId: 3,
    createdAt: "2026-05-03T10:00:00.000Z",
    updatedAt: "2026-05-03T10:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 3,
    digest: "sha256:shared-child",
    manifestKind: "image_manifest",
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });
  writer.insertManifestEdge({
    parentDigest: "sha256:old-delete-root",
    childDigest: "sha256:shared-child",
    edgeKind: "image-child"
  });
  writer.insertManifestEdge({
    parentDigest: "sha256:young-retained-root",
    childDigest: "sha256:shared-child",
    edgeKind: "image-child"
  });
  writer.rebuildManifestReachability();
  writer.markScanCompleted("2026-05-14T10:00:00.000Z");

  const plan = repository.getDeleteTagsPlanWithCutoff("acme", "older-blocked", ["pr-123"], [], {
    olderThan: "30 days",
    cutoffTimestamp: "2026-04-14T10:00:00.000Z"
  });

  assert.deepEqual(plan.directTargetRoots, [
    {
      versionId: 1,
      digest: "sha256:old-delete-root",
      manifestKind: "image_index",
      reason: "delete-tags-all-tags-selected",
      selectionMode: "delete-root"
    }
  ]);
  assert.deepEqual(plan.blockedRoots, [
    {
      blockedVersionId: 1,
      blockedDigest: "sha256:old-delete-root",
      blockingVersionId: 2,
      blockingDigest: "sha256:young-retained-root",
      overlapDigest: "sha256:shared-child",
      overlapManifestKind: "image_manifest",
      reason: "overlap-with-retained-root"
    }
  ]);

  database.close();
});
