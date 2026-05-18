import assert from "node:assert/strict";
import test from "node:test";
import type { DeletePlan } from "../../src/db/index.js";
import { executeDeletePlan } from "../../src/execute/index.js";

test("executeDeletePlan deletes fully deletable roots and returns a summary", async () => {
  const deletedVersionIds: number[] = [];
  const plan: DeletePlan = {
    owner: "acme",
    packageName: "example",
    scanCompletedAt: "2026-05-15T00:00:00.000Z",
    plannerInputs: {
      deleteUntagged: true,
      deleteTags: [],
      excludeTags: []
    },
    validationSummary: {
      directTargetTagCount: 0,
      directTargetRootCount: 1,
      deleteRootCandidateCount: 1,
      untagOnlyRootCount: 0,
      fullyDeletableRootCount: 1,
      blockedDeleteRootCount: 0,
      protectedRootCount: 0
    },
    directTargetTags: [],
    directTargetRoots: [
      {
        versionId: 104,
        digest: "sha256:untagged-old",
        reason: "delete-untagged",
        selectionMode: "delete-root"
      }
    ],
    rootDecisions: [
      {
        versionId: 104,
        digest: "sha256:untagged-old",
        selectionMode: "delete-root",
        selectionReason: "delete-untagged",
        validationStatus: "fully-deletable",
        validationReasonCode: "fully-deletable-no-retained-overlap",
        validationReason: "root closure does not overlap any retained root"
      }
    ],
    protectedRoots: [],
    closureManifests: [],
    blockedRoots: [],
    fullyDeletableRoots: [
      {
        versionId: 104,
        digest: "sha256:untagged-old",
        reason: "delete-untagged",
        selectionMode: "delete-root"
      }
    ],
    collateralTags: []
  };

  const summary = await executeDeletePlan(plan, {
    token: "token",
    logger: {
      debug() {},
      info() {},
      warn() {},
      error() {}
    },
    githubApiBaseUrl: "https://api.github.test",
    fetchImpl: async (input) => {
      deletedVersionIds.push(Number(String(input).split("/").pop()));
      return {
        ok: true,
        status: 204,
        headers: new Headers(),
        async json() {
          return {};
        }
      };
    }
  });

  assert.deepEqual(deletedVersionIds, [104]);
  assert.deepEqual(summary.deletedPackageVersions, [{ versionId: 104, digest: "sha256:untagged-old" }]);
  assert.deepEqual(summary.untaggedTags, []);
});

test("executeDeletePlan applies untag-only roots before deleting fully deletable roots", async () => {
  const plan: DeletePlan = {
    owner: "acme",
    packageName: "example",
    scanCompletedAt: "2026-05-15T00:00:00.000Z",
    plannerInputs: {
      deleteUntagged: false,
      deleteTags: ["latest"],
      excludeTags: []
    },
    validationSummary: {
      directTargetTagCount: 1,
      directTargetRootCount: 1,
      deleteRootCandidateCount: 0,
      untagOnlyRootCount: 1,
      fullyDeletableRootCount: 0,
      blockedDeleteRootCount: 0,
      protectedRootCount: 0
    },
    directTargetTags: ["latest"],
    directTargetRoots: [
      {
        versionId: 101,
        digest: "sha256:index-current",
        reason: "delete-tags-partial-tag-match",
        selectionMode: "untag-only"
      }
    ],
    rootDecisions: [
      {
        versionId: 101,
        digest: "sha256:index-current",
        selectionMode: "untag-only",
        selectionReason: "delete-tags-partial-tag-match",
        validationStatus: "untag-only",
        validationReasonCode: "untag-only-partial-tag-match",
        validationReason: "selected tags do not cover every tag on the root"
      }
    ],
    protectedRoots: [],
    closureManifests: [],
    blockedRoots: [],
    fullyDeletableRoots: [],
    collateralTags: []
  };

  const fetchCalls: Array<{ url: string; method?: string }> = [];
  let detachedDigest = "sha256:detached";
  const summary = await executeDeletePlan(plan, {
    token: "token",
    logger: {
      debug() {},
      info() {},
      warn() {},
      error() {}
    },
    githubApiBaseUrl: "https://api.github.test",
    registryBaseUrl: "https://ghcr.example.test",
    listRootTags() {
      return ["keep-me", "latest"];
    },
    fetchImpl: async (input, init) => {
      const url = String(input);
      fetchCalls.push({ url, method: init?.method });

      if (url.startsWith("https://ghcr.example.test/token")) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          async json() {
            return { token: "registry-token" };
          }
        };
      }
      if (url === "https://ghcr.example.test/v2/acme/example/manifests/sha256:index-current") {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/vnd.oci.image.manifest.v1+json" }),
          async json() {
            return {
              schemaVersion: 2,
              mediaType: "application/vnd.oci.image.manifest.v1+json",
              config: { mediaType: "application/vnd.oci.image.config.v1+json", digest: "sha256:config", size: 1 },
              layers: []
            };
          }
        };
      }
      if (url === "https://ghcr.example.test/v2/acme/example/manifests/latest") {
        const crypto = await import("node:crypto");
        detachedDigest = `sha256:${crypto
          .createHash("sha256")
          .update(String(init?.body ?? ""))
          .digest("hex")}`;
        return {
          ok: true,
          status: 201,
          headers: new Headers(),
          async json() {
            return {};
          }
        };
      }
      if (url === "https://api.github.test/orgs/acme/packages/container/example/versions?per_page=100&page=1") {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          async json() {
            return [
              {
                id: 303,
                name: detachedDigest,
                metadata: {
                  container: {
                    tags: ["latest"]
                  }
                }
              }
            ];
          }
        };
      }

      return {
        ok: true,
        status: 204,
        headers: new Headers(),
        async json() {
          return {};
        }
      };
    }
  });

  assert.deepEqual(summary.deletedPackageVersions, []);
  assert.deepEqual(
    summary.untaggedTags.map((operation) => operation.tag),
    ["latest"]
  );
  assert.equal(
    fetchCalls.some((call) => call.url === "https://ghcr.example.test/v2/acme/example/manifests/latest"),
    true
  );
});

test("executeDeletePlan rejects untag-only roots without listRootTags support", async () => {
  const plan: DeletePlan = {
    owner: "acme",
    packageName: "example",
    scanCompletedAt: "2026-05-15T00:00:00.000Z",
    plannerInputs: {
      deleteUntagged: false,
      deleteTags: ["latest"],
      excludeTags: []
    },
    validationSummary: {
      directTargetTagCount: 1,
      directTargetRootCount: 1,
      deleteRootCandidateCount: 0,
      untagOnlyRootCount: 1,
      fullyDeletableRootCount: 0,
      blockedDeleteRootCount: 0,
      protectedRootCount: 0
    },
    directTargetTags: ["latest"],
    directTargetRoots: [
      {
        versionId: 101,
        digest: "sha256:index-current",
        reason: "delete-tags-partial-tag-match",
        selectionMode: "untag-only"
      }
    ],
    rootDecisions: [
      {
        versionId: 101,
        digest: "sha256:index-current",
        selectionMode: "untag-only",
        selectionReason: "delete-tags-partial-tag-match",
        validationStatus: "untag-only",
        validationReasonCode: "untag-only-partial-tag-match",
        validationReason: "selected tags do not cover every tag on the root"
      }
    ],
    protectedRoots: [],
    closureManifests: [],
    blockedRoots: [],
    fullyDeletableRoots: [],
    collateralTags: []
  };

  await assert.rejects(
    () =>
      executeDeletePlan(plan, {
        token: "token",
        logger: {
          debug() {},
          info() {},
          warn() {},
          error() {}
        }
      }),
    /execution requires listRootTags support for untag-only root sha256:index-current/
  );
});

test("executeDeletePlan rejects untag-only roots when no selected tags resolve", async () => {
  const plan: DeletePlan = {
    owner: "acme",
    packageName: "example",
    scanCompletedAt: "2026-05-15T00:00:00.000Z",
    plannerInputs: {
      deleteUntagged: false,
      deleteTags: ["latest"],
      excludeTags: []
    },
    validationSummary: {
      directTargetTagCount: 1,
      directTargetRootCount: 1,
      deleteRootCandidateCount: 0,
      untagOnlyRootCount: 1,
      fullyDeletableRootCount: 0,
      blockedDeleteRootCount: 0,
      protectedRootCount: 0
    },
    directTargetTags: ["latest"],
    directTargetRoots: [
      {
        versionId: 101,
        digest: "sha256:index-current",
        reason: "delete-tags-partial-tag-match",
        selectionMode: "untag-only"
      }
    ],
    rootDecisions: [
      {
        versionId: 101,
        digest: "sha256:index-current",
        selectionMode: "untag-only",
        selectionReason: "delete-tags-partial-tag-match",
        validationStatus: "untag-only",
        validationReasonCode: "untag-only-partial-tag-match",
        validationReason: "selected tags do not cover every tag on the root"
      }
    ],
    protectedRoots: [],
    closureManifests: [],
    blockedRoots: [],
    fullyDeletableRoots: [],
    collateralTags: []
  };

  await assert.rejects(
    () =>
      executeDeletePlan(plan, {
        token: "token",
        logger: {
          debug() {},
          info() {},
          warn() {},
          error() {}
        },
        listRootTags() {
          return ["keep-me"];
        }
      }),
    /no selected tags resolved for untag-only root sha256:index-current/
  );
});
