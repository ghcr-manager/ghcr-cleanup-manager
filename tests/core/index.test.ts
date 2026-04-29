import assert from "node:assert/strict";
import test from "node:test";
import type { PackageSnapshot } from "../../src/core/index.js";

test("core index re-exports public types", () => {
  const snapshot: PackageSnapshot = {
    packageName: "acme/example",
    scanCompletedAt: "2026-04-20T12:00:00.000Z",
    packageVersions: [],
    tags: [],
    manifests: [],
    manifestEdges: [],
  };

  assert.equal(snapshot.packageName, "acme/example");
});
