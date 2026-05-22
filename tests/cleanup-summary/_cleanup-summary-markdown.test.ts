import assert from "node:assert/strict";
import test from "node:test";
import { ManifestKinds } from "../../src/core/index.js";
import { DeletePlanValidationReasonCodes, DeletePlanValidationStatuses } from "../../src/db/index.js";
import { renderCleanupSummaryMarkdown } from "../../src/cleanup-summary/index.js";

test("renderCleanupSummaryMarkdown renders user-facing counts and truncates long lists", () => {
  const markdown = renderCleanupSummaryMarkdown(
    {
      command: "cleanup",
      owner: "acme",
      packageName: "example",
      scanCompletedAt: "2026-05-20T10:00:00.000Z",
      dryRun: true,
      plannerInputs: { deleteTags: ["a", "b"], useRegex: true },
      directTargetTags: ["a", "b", "c"],
      collateralTags: [],
      fullyDeletableRoots: [
        {
          versionId: 101,
          digest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          manifestKind: ManifestKinds.crossArchManifest,
      rootTags: ["release-amd64-test", "release-arm64-test", "release-debug-test"],
          matchedTags: ["release-amd64-test"],
          selectionMode: "delete-root",
          selectionReason: "delete-tags-partial-tag-match",
          validationStatus: DeletePlanValidationStatuses.fullyDeletable,
          validationReasonCode: DeletePlanValidationReasonCodes.fullyDeletableNoRetainedOverlap,
          validationReason: "No retained overlap"
        }
      ],
      untagOnlyRoots: [],
      blockedRoots: [],
      affectedManifests: [
        { digest: "sha256:a", manifestKind: ManifestKinds.crossArchManifest },
        { digest: "sha256:b", manifestKind: ManifestKinds.imageManifest },
        { digest: "sha256:c", manifestKind: ManifestKinds.signatureManifest }
      ],
      plannedChanges: {
        tagRemovals: 3,
        imageDeletes: 1,
        indexDeletes: 1,
        crossArchDeletes: 1,
        artifactDeletes: 0,
        attestationDeletes: 0,
        signatureDeletes: 1,
        totalManifestDeletes: 3
      },
      deletedPackageVersions: [],
      untaggedTags: [],
      unsupportedUntagRoots: []
    },
    {
      maxDirectTargetTags: 2,
      maxRootsPerSection: 10
    }
  );

  assert.match(markdown, /## Cleanup Summary/);
  assert.match(markdown, /\| 📦 Package \| `acme\/example` \|/);
  assert.match(markdown, /\| 🔖 Deleted tags \| 3 \|/);
  assert.match(markdown, /\| 🖼️ Deleted images \| 1 \|/);
  assert.match(markdown, /\| 📚 Deleted cross-arch manifests \| 1 \|/);
  assert.match(markdown, /\| 🧱 Deleted indexes \| 1 \|/);
  assert.match(markdown, /\| 📄 Deleted total \| 3 \|/);
  assert.match(markdown, /<summary>📦 Deleted item breakdown<\/summary>/);
  assert.match(markdown, /\| Images \| 1 \|/);
  assert.match(markdown, /\| Generic indexes \| 1 \|/);
  assert.match(markdown, /\| Cross-arch manifests \| 1 \|/);
  assert.match(markdown, /\| Signatures \| 1 \|/);
  assert.doesNotMatch(markdown, /\| Attestations \| 0 \|/);
  assert.doesNotMatch(markdown, /\| Artifact manifests \| 0 \|/);
  assert.match(markdown, /<summary>⚙️ Cleanup filter<\/summary>/);
  assert.match(markdown, /\| Delete tags \| 2 patterns \|/);
  assert.match(markdown, /\| Use regex \| yes \|/);
  assert.match(markdown, /- Delete tags:/);
  assert.match(markdown, /`a`/);
  assert.match(markdown, /`b`/);
  assert.match(markdown, /<summary>🏷️ Selected tags<\/summary>/);
  assert.match(markdown, /<summary>🗑️ Deleted items<\/summary>/);
  assert.match(markdown, /Showing first 2 of 3 selected tags/);
  assert.match(markdown, /sha256:aaaaaaaa\.\.\.aaaaaaaa/);
  assert.match(markdown, /release-amd64-test, release-arm64-tes\.\.\./);
  assert.match(markdown, /Tag lists may be truncated for table width\./);
  assert.match(
    markdown,
    /\| 101 \| cross-arch \| `sha256:aaaaaaaa\.\.\.aaaaaaaa` \| release-amd64-test, release-arm64-tes\.\.\. \| Delete item and descendants \|/
  );
  assert.doesNotMatch(markdown, /<summary>🔗 Tags removed only<\/summary>/);
  assert.doesNotMatch(markdown, /<summary>🛡️ Blocked items<\/summary>/);
});

test("renderCleanupSummaryMarkdown renders blocked, tag-only, and live-effect details", () => {
  const markdown = renderCleanupSummaryMarkdown(
    {
      command: "cleanup",
      owner: "acme`team",
      packageName: "example",
      scanCompletedAt: "2026-05-20T10:00:00.000Z",
      dryRun: false,
      plannerInputs: { deleteUntagged: true },
      directTargetTags: [],
      collateralTags: [],
      fullyDeletableRoots: [],
      untagOnlyRoots: [
        {
          versionId: 201,
          digest: "sha256:short",
          manifestKind: ManifestKinds.imageManifest,
          rootTags: [],
          matchedTags: ["keep|me"],
          selectionMode: "untag-only",
          selectionReason: "delete-tags-partial-tag-match",
          validationStatus: DeletePlanValidationStatuses.untagOnly,
          validationReasonCode: DeletePlanValidationReasonCodes.untagOnlyPartialTagMatch,
          validationReason: "detaches"
        }
      ],
      blockedRoots: [
        {
          versionId: 202,
          digest: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          manifestKind: ManifestKinds.imageManifest,
          rootTags: ["line1\nline2"],
          matchedTags: [],
          selectionMode: "delete-root",
          selectionReason: "delete-tags-all-tags-selected",
          validationStatus: DeletePlanValidationStatuses.blocked,
          validationReasonCode: DeletePlanValidationReasonCodes.blockedOverlapWithRetainedRoot,
          validationReason: "blocked",
          blockingDigest: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
          overlapDigest: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
        },
        {
          versionId: 203,
          digest: "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
          manifestKind: ManifestKinds.artifactManifest,
          rootTags: [],
          matchedTags: [],
          selectionMode: "delete-root",
          selectionReason: "delete-tags-all-tags-selected",
          validationStatus: DeletePlanValidationStatuses.blocked,
          validationReasonCode: DeletePlanValidationReasonCodes.blockedOverlapWithRetainedRoot,
          validationReason: "blocked",
          blockingDigest: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
        }
      ],
      affectedManifests: [],
      plannedChanges: {
        tagRemovals: 1,
        imageDeletes: 0,
        indexDeletes: 0,
        crossArchDeletes: 0,
        artifactDeletes: 0,
        attestationDeletes: 0,
        signatureDeletes: 0,
        totalManifestDeletes: 0
      },
      deletedPackageVersions: [
        { versionId: 202, digest: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" }
      ],
      untaggedTags: [
        {
          tag: "keep|me",
          sourceVersionId: 201,
          sourceDigest: "sha256:short",
          detachedVersionId: 301,
          detachedDigest: "sha256:detached"
        }
      ],
      unsupportedUntagRoots: [
        {
          versionId: 999,
          digest: "sha256:unsupported",
          reason: "unsupported"
        }
      ]
    },
    {
      maxDirectTargetTags: 5,
      maxRootsPerSection: 5
    }
  );

  assert.match(markdown, /`acme\\`team\/example`/);
  assert.match(markdown, /<summary>🔗 Tags removed only<\/summary>/);
  assert.match(markdown, /<summary>🛡️ Blocked items<\/summary>/);
  assert.match(markdown, /\(untagged\)/);
  assert.match(markdown, /keep\\\|me/);
  assert.match(markdown, /line1 line2/);
  assert.match(markdown, /Remove selected tags, keep item/);
  assert.match(markdown, /Blocked by retained item sha256:cccccccc\.\.\.cccccccc via sha256:dddddddd\.\.\.dddddddd/);
  assert.match(markdown, /\| Delete untagged \| yes \|/);
  assert.match(markdown, /### Applied changes/);
  assert.match(markdown, /Deleted package versions: 1/);
  assert.match(markdown, /Detached tags: 1/);
  assert.match(markdown, /Unsupported untag roots: 1/);
});

test("renderCleanupSummaryMarkdown notes when a root section is truncated", () => {
  const markdown = renderCleanupSummaryMarkdown(
    {
      command: "cleanup",
      owner: "acme",
      packageName: "example",
      scanCompletedAt: "2026-05-20T10:00:00.000Z",
      dryRun: true,
      plannerInputs: { deleteTags: ["a"] },
      directTargetTags: ["a"],
      collateralTags: [],
      fullyDeletableRoots: [
        {
          versionId: 101,
          digest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          manifestKind: ManifestKinds.imageManifest,
          rootTags: ["a"],
          matchedTags: ["a"],
          selectionMode: "delete-root",
          selectionReason: "delete-tags-all-tags-selected",
          validationStatus: DeletePlanValidationStatuses.fullyDeletable,
          validationReasonCode: DeletePlanValidationReasonCodes.fullyDeletableNoRetainedOverlap,
          validationReason: "No retained overlap"
        },
        {
          versionId: 102,
          digest: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          manifestKind: ManifestKinds.imageManifest,
          rootTags: ["a"],
          matchedTags: ["a"],
          selectionMode: "delete-root",
          selectionReason: "delete-tags-all-tags-selected",
          validationStatus: DeletePlanValidationStatuses.fullyDeletable,
          validationReasonCode: DeletePlanValidationReasonCodes.fullyDeletableNoRetainedOverlap,
          validationReason: "No retained overlap"
        }
      ],
      untagOnlyRoots: [],
      blockedRoots: [],
      affectedManifests: [{ digest: "sha256:a", manifestKind: ManifestKinds.imageManifest }],
      plannedChanges: {
        tagRemovals: 1,
        imageDeletes: 1,
        indexDeletes: 0,
        crossArchDeletes: 0,
        artifactDeletes: 0,
        attestationDeletes: 0,
        signatureDeletes: 0,
        totalManifestDeletes: 1
      },
      deletedPackageVersions: [],
      untaggedTags: [],
      unsupportedUntagRoots: []
    },
    {
      maxDirectTargetTags: 5,
      maxRootsPerSection: 1
    }
  );

  assert.match(markdown, /Showing first 1 of 2 🗑️ deleted items\./i);
});

test("renderCleanupSummaryMarkdown does not show digest-tag helper tags in user-facing markdown", () => {
  const markdown = renderCleanupSummaryMarkdown(
    {
      command: "cleanup",
      owner: "acme",
      packageName: "example",
      scanCompletedAt: "2026-05-20T10:00:00.000Z",
      dryRun: true,
      plannerInputs: { deleteTags: [".*"], useRegex: true },
      directTargetTags: ["release-1"],
      collateralTags: [],
      fullyDeletableRoots: [],
      untagOnlyRoots: [],
      blockedRoots: [],
      affectedManifests: [],
      plannedChanges: {
        tagRemovals: 0,
        imageDeletes: 0,
        indexDeletes: 0,
        crossArchDeletes: 0,
        artifactDeletes: 0,
        attestationDeletes: 0,
        signatureDeletes: 0,
        totalManifestDeletes: 0
      },
      deletedPackageVersions: [],
      untaggedTags: [],
      unsupportedUntagRoots: []
    },
    {}
  );

  assert.doesNotMatch(markdown, /Digest-tag helper tags/);
  assert.doesNotMatch(markdown, /helper\/referrer artifacts, not ordinary user-facing image tags/);
});
