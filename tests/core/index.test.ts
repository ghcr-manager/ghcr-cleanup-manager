import assert from "node:assert/strict";
import test from "node:test";
import { buildHttpErrorMessage, isRetryableGitHubApiStatus, type PackageSnapshot } from "../../src/core/index.js";

test("core index re-exports public types", () => {
  const snapshot: PackageSnapshot = {
    packageName: "acme/example",
    scanCompletedAt: "2026-04-20T12:00:00.000Z",
    packageVersions: [],
    tags: [],
    manifests: [],
    manifestEdges: []
  };

  assert.equal(snapshot.packageName, "acme/example");
});

test("core index re-exports http error formatting", async () => {
  const message = await buildHttpErrorMessage(
    {
      status: 404,
      headers: new Headers({ "content-type": "application/json" }),
      async json() {
        return {
          message: "Not Found",
          documentation_url: "https://docs.example.test"
        };
      }
    },
    "fallback"
  );

  assert.equal(message, "fallback - status 404 - Not Found - https://docs.example.test");
});

test("core index re-exports GitHub REST retry helpers", () => {
  assert.equal(isRetryableGitHubApiStatus(429), true);
});
