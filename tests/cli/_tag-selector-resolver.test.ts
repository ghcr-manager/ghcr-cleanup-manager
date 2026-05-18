import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openDatabase, ScanWriter } from "../../src/db/index.js";
import { resolveTagSelectors } from "../../src/cli/_tag-selector-resolver.js";
import { importFileScan } from "../helpers/index.js";

async function _withSampleDatabase(
  run: (database: ReturnType<typeof openDatabase>, databasePath: string) => Promise<void>
): Promise<void> {
  const tempDirectory = mkdtempSync(join(tmpdir(), "ghcr-manager-"));
  const databasePath = join(tempDirectory, "scan.sqlite");
  const database = openDatabase(databasePath);
  const writer = new ScanWriter(database);
  await importFileScan("tests/fixtures/sample-package.json", writer);

  try {
    await run(database, databasePath);
  } finally {
    database.close();
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

test("resolveTagSelectors keeps wildcard delete-tag selectors for planner-side SQL matching", async () => {
  await _withSampleDatabase(async (database) => {
    const inputs = {
      databasePath: "scan.sqlite",
      owner: "acme",
      packageName: "example",
      deleteTags: ["*me"],
      deleteTagsRequested: true,
      deleteGhostImages: false,
      deletePartialImages: false,
      deleteOrphanedImages: false,
      excludeTags: [],
      deleteUntagged: false,
      useRegex: false
    };

    const resolved = resolveTagSelectors(database, inputs);
    assert.deepEqual(resolved.deleteTags, ["*me"]);
    assert.deepEqual(resolved.excludeTags, []);
  });
});

test("resolveTagSelectors treats sql wildcard characters literally in wildcard mode", () => {
  const tempDirectory = mkdtempSync(join(tmpdir(), "ghcr-manager-"));
  const databasePath = join(tempDirectory, "scan.sqlite");
  const database = openDatabase(databasePath);
  const writer = new ScanWriter(database);
  writer.resetScan("acme", "example", "2026-05-15T00:00:00.000Z");
  writer.insertPackageVersion({
    versionId: 201,
    createdAt: "2026-05-10T00:00:00.000Z",
    updatedAt: "2026-05-10T00:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 201,
    digest: "sha256:literal-percent",
    mediaType: "application/vnd.oci.image.manifest.v1+json",
    manifestKind: "image_manifest"
  });
  writer.insertTag({
    tag: "release%candidate_1",
    versionId: 201
  });
  writer.insertPackageVersion({
    versionId: 202,
    createdAt: "2026-05-11T00:00:00.000Z",
    updatedAt: "2026-05-11T00:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 202,
    digest: "sha256:similar",
    mediaType: "application/vnd.oci.image.manifest.v1+json",
    manifestKind: "image_manifest"
  });
  writer.insertTag({
    tag: "releasexcandidatez1",
    versionId: 202
  });
  writer.markScanCompleted("2026-05-15T00:00:00.000Z");

  try {
    const resolved = resolveTagSelectors(database, {
      databasePath,
      owner: "acme",
      packageName: "example",
      deleteTags: ["release%candidate_1"],
      deleteTagsRequested: true,
      deleteGhostImages: false,
      deletePartialImages: false,
      deleteOrphanedImages: false,
      excludeTags: [],
      deleteUntagged: false,
      useRegex: false
    });

    assert.deepEqual(resolved.deleteTags, ["release%candidate_1"]);
  } finally {
    database.close();
    rmSync(tempDirectory, { recursive: true, force: true });
  }
});

test("resolveTagSelectors keeps wildcard delete-tag and exclude-tag selectors for planner-side SQL matching", async () => {
  await _withSampleDatabase(async (database) => {
    const inputs = {
      databasePath: "scan.sqlite",
      owner: "acme",
      packageName: "example",
      deleteTags: ["l*"],
      deleteTagsRequested: true,
      deleteGhostImages: false,
      deletePartialImages: false,
      deleteOrphanedImages: false,
      excludeTags: ["*me"],
      deleteUntagged: false,
      useRegex: false
    };

    const resolved = resolveTagSelectors(database, inputs);
    assert.deepEqual(resolved.deleteTags, ["l*"]);
    assert.deepEqual(resolved.excludeTags, ["*me"]);
  });
});

test("resolveTagSelectors keeps regex delete-tag and exclude-tag selectors for planner-side SQL matching", async () => {
  await _withSampleDatabase(async (database) => {
    const inputs = {
      databasePath: "scan.sqlite",
      owner: "acme",
      packageName: "example",
      deleteTags: ["^l.*"],
      deleteTagsRequested: true,
      deleteGhostImages: false,
      deletePartialImages: false,
      deleteOrphanedImages: false,
      excludeTags: [".*me$"],
      deleteUntagged: false,
      useRegex: true
    };

    const resolved = resolveTagSelectors(database, inputs);
    assert.deepEqual(resolved.deleteTags, ["^l.*"]);
    assert.deepEqual(resolved.excludeTags, [".*me$"]);
  });
});

test("resolveTagSelectors resolves orphaned sha256 tags with missing parent digests", () => {
  const tempDirectory = mkdtempSync(join(tmpdir(), "ghcr-manager-"));
  const databasePath = join(tempDirectory, "scan.sqlite");
  const database = openDatabase(databasePath);
  const writer = new ScanWriter(database);
  const orphanParentDigest = `sha256:${"a".repeat(64)}`;
  const existingParentDigest = `sha256:${"b".repeat(64)}`;
  writer.resetScan("acme", "example", "2026-05-15T00:00:00.000Z");
  writer.insertPackageVersion({
    versionId: 201,
    createdAt: "2026-05-10T00:00:00.000Z",
    updatedAt: "2026-05-10T00:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 201,
    digest: "sha256:orphaned-signature",
    mediaType: "application/vnd.oci.image.manifest.v1+json",
    manifestKind: "signature_manifest"
  });
  writer.insertTag({
    tag: `${orphanParentDigest.replace("sha256:", "sha256-")}.sig`,
    versionId: 201
  });
  writer.insertPackageVersion({
    versionId: 202,
    createdAt: "2026-05-11T00:00:00.000Z",
    updatedAt: "2026-05-11T00:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 202,
    digest: "sha256:linked-signature",
    mediaType: "application/vnd.oci.image.manifest.v1+json",
    manifestKind: "signature_manifest"
  });
  writer.insertTag({
    tag: `${existingParentDigest.replace("sha256:", "sha256-")}.sig`,
    versionId: 202
  });
  writer.insertPackageVersion({
    versionId: 203,
    createdAt: "2026-05-09T00:00:00.000Z",
    updatedAt: "2026-05-09T00:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 203,
    digest: existingParentDigest,
    mediaType: "application/vnd.oci.image.manifest.v1+json",
    manifestKind: "image_manifest"
  });
  writer.markScanCompleted("2026-05-15T00:00:00.000Z");

  try {
    const resolved = resolveTagSelectors(database, {
      databasePath,
      owner: "acme",
      packageName: "example",
      deleteTags: [],
      deleteTagsRequested: true,
      deleteGhostImages: false,
      deletePartialImages: false,
      deleteOrphanedImages: true,
      excludeTags: [],
      deleteUntagged: false,
      useRegex: false
    });

    assert.deepEqual(resolved.deleteTags, [`${orphanParentDigest.replace("sha256:", "sha256-")}.sig`]);
    assert.deepEqual(resolved.excludeTags, []);
  } finally {
    database.close();
    rmSync(tempDirectory, { recursive: true, force: true });
  }
});

test("resolveTagSelectors resolves ghost image tags when all image index children are missing", () => {
  const tempDirectory = mkdtempSync(join(tmpdir(), "ghcr-manager-"));
  const databasePath = join(tempDirectory, "scan.sqlite");
  const database = openDatabase(databasePath);
  const writer = new ScanWriter(database);
  writer.resetScan("acme", "example", "2026-05-15T00:00:00.000Z");
  writer.insertPackageVersion({
    versionId: 201,
    createdAt: "2026-05-10T00:00:00.000Z",
    updatedAt: "2026-05-10T00:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 201,
    digest: "sha256:ghost-index",
    mediaType: "application/vnd.oci.image.index.v1+json",
    manifestKind: "image_index"
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
  writer.insertPackageVersion({
    versionId: 202,
    createdAt: "2026-05-11T00:00:00.000Z",
    updatedAt: "2026-05-11T00:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 202,
    digest: "sha256:partial-index",
    mediaType: "application/vnd.oci.image.index.v1+json",
    manifestKind: "image_index"
  });
  writer.insertTag({
    tag: "partial",
    versionId: 202
  });
  writer.insertManifestDescriptor({
    parentDigest: "sha256:partial-index",
    childDigest: "sha256:present-child",
    mediaType: "application/vnd.oci.image.manifest.v1+json",
    platform: { os: "linux", architecture: "amd64" }
  });
  writer.insertManifestDescriptor({
    parentDigest: "sha256:partial-index",
    childDigest: "sha256:missing-child",
    mediaType: "application/vnd.oci.image.manifest.v1+json",
    platform: { os: "linux", architecture: "arm64" }
  });
  writer.insertPackageVersion({
    versionId: 203,
    createdAt: "2026-05-11T00:00:00.000Z",
    updatedAt: "2026-05-11T00:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 203,
    digest: "sha256:present-child",
    mediaType: "application/vnd.oci.image.manifest.v1+json",
    manifestKind: "image_manifest",
    platform: { os: "linux", architecture: "amd64" }
  });
  writer.rebuildManifestReachability();
  writer.markScanCompleted("2026-05-15T00:00:00.000Z");

  try {
    const resolved = resolveTagSelectors(database, {
      databasePath,
      owner: "acme",
      packageName: "example",
      deleteTags: [],
      deleteTagsRequested: true,
      deleteGhostImages: true,
      deletePartialImages: false,
      deleteOrphanedImages: false,
      excludeTags: [],
      deleteUntagged: false,
      useRegex: false
    });

    assert.deepEqual(resolved.deleteTags, ["ghost"]);
    assert.deepEqual(resolved.excludeTags, []);
  } finally {
    database.close();
    rmSync(tempDirectory, { recursive: true, force: true });
  }
});

test("resolveTagSelectors resolves partial image tags when some image index children are missing", () => {
  const tempDirectory = mkdtempSync(join(tmpdir(), "ghcr-manager-"));
  const databasePath = join(tempDirectory, "scan.sqlite");
  const database = openDatabase(databasePath);
  const writer = new ScanWriter(database);
  writer.resetScan("acme", "example", "2026-05-15T00:00:00.000Z");
  writer.insertPackageVersion({
    versionId: 201,
    createdAt: "2026-05-10T00:00:00.000Z",
    updatedAt: "2026-05-10T00:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 201,
    digest: "sha256:partial-index",
    mediaType: "application/vnd.oci.image.index.v1+json",
    manifestKind: "image_index"
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
    childDigest: "sha256:missing-child",
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
    mediaType: "application/vnd.oci.image.manifest.v1+json",
    manifestKind: "image_manifest",
    platform: { os: "linux", architecture: "amd64" }
  });
  writer.insertPackageVersion({
    versionId: 203,
    createdAt: "2026-05-12T00:00:00.000Z",
    updatedAt: "2026-05-12T00:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 203,
    digest: "sha256:ghost-index",
    mediaType: "application/vnd.oci.image.index.v1+json",
    manifestKind: "image_index"
  });
  writer.insertTag({
    tag: "ghost",
    versionId: 203
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

  try {
    const resolved = resolveTagSelectors(database, {
      databasePath,
      owner: "acme",
      packageName: "example",
      deleteTags: [],
      deleteTagsRequested: true,
      deleteGhostImages: false,
      deletePartialImages: true,
      deleteOrphanedImages: false,
      excludeTags: [],
      deleteUntagged: false,
      useRegex: false
    });

    assert.deepEqual(resolved.deleteTags, ["partial"]);
    assert.deepEqual(resolved.excludeTags, []);
  } finally {
    database.close();
    rmSync(tempDirectory, { recursive: true, force: true });
  }
});
