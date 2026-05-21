import assert from "node:assert/strict";
import test from "node:test";
import { buildCleanupSummary } from "../../src/cleanup-summary/index.js";

test("buildCleanupSummary groups root decisions and carries live execution effects", () => {
  const summary = buildCleanupSummary(
    {
      owner: "acme",
      packageName: "example",
      scanCompletedAt: "2026-05-20T10:00:00.000Z",
      plannerInputs: { deleteTags: ["delete-me"], useRegex: true },
      validationSummary: {
        directTargetTagCount: 1,
        directTargetRootCount: 3,
        deleteRootCandidateCount: 2,
        untagOnlyRootCount: 1,
        fullyDeletableRootCount: 1,
        blockedDeleteRootCount: 1,
        protectedRootCount: 1
      },
      directTargetTags: ["delete-me"],
      directTargetRoots: [],
      rootDecisions: [
        {
          versionId: 101,
          digest: "sha256:fully",
          selectionMode: "delete-root",
          selectionReason: "matched delete tag",
          validationStatus: "fully-deletable",
          validationReasonCode: "fully-deletable-no-retained-overlap",
          validationReason: "No retained overlap"
        },
        {
          versionId: 102,
          digest: "sha256:untag",
          selectionMode: "delete-root",
          selectionReason: "matched delete tag",
          validationStatus: "untag-only",
          validationReasonCode: "untag-only-partial-tag-match",
          validationReason: "Only selected tags can be detached"
        },
        {
          versionId: 103,
          digest: "sha256:blocked",
          selectionMode: "delete-root",
          selectionReason: "matched delete tag",
          validationStatus: "blocked",
          validationReasonCode: "blocked-overlap-with-retained-root",
          validationReason: "Retained overlap exists",
          blockingVersionId: 104,
          blockingDigest: "sha256:blocker",
          overlapDigest: "sha256:overlap"
        }
      ],
      protectedRoots: [],
      closureManifests: [],
      blockedRoots: [],
      fullyDeletableRoots: [],
      collateralTags: ["keep-me"]
    },
    {
      dryRun: false,
      listRootTags: (versionId) => {
        switch (versionId) {
          case 101:
            return ["delete-me"];
          case 102:
            return ["delete-me", "keep-me"];
          case 103:
            return ["delete-me"];
          default:
            return [];
        }
      },
      listAffectedManifestDigests: (rootDigests) => {
        assert.deepEqual(rootDigests, ["sha256:fully"]);
        return ["sha256:child", "sha256:fully"];
      },
      executionSummary: {
        owner: "acme",
        packageName: "example",
        scanCompletedAt: "2026-05-20T10:00:00.000Z",
        plannerInputs: { deleteTags: ["delete-me"] },
        deletedPackageVersions: [{ versionId: 101, digest: "sha256:fully" }],
        untaggedTags: [
          {
            tag: "delete-me",
            sourceVersionId: 102,
            sourceDigest: "sha256:untag",
            detachedVersionId: 202,
            detachedDigest: "sha256:detached"
          }
        ],
        blockedRoots: [],
        unsupportedUntagRoots: []
      }
    }
  );

  assert.equal(summary.command, "cleanup");
  assert.equal(summary.dryRun, false);
  assert.deepEqual(summary.collateralTags, ["keep-me"]);
  assert.equal(summary.fullyDeletableRoots.length, 1);
  assert.equal(summary.untagOnlyRoots.length, 1);
  assert.equal(summary.blockedRoots.length, 1);
  assert.equal(summary.affectedManifestCount, 2);
  assert.deepEqual(summary.affectedManifests, [{ digest: "sha256:child" }, { digest: "sha256:fully" }]);
  assert.deepEqual(summary.untagOnlyRoots[0]?.matchedTags, ["delete-me"]);
  assert.deepEqual(summary.deletedPackageVersions, [{ versionId: 101, digest: "sha256:fully" }]);
  assert.equal(summary.untaggedTags[0]?.tag, "delete-me");
  assert.equal(summary.blockedRoots[0]?.blockingVersionId, 104);
});
