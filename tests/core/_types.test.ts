import assert from "node:assert/strict";
import test from "node:test";
import type { PackageSnapshot, PlanOptions } from "../../src/core/index.js";

test("core types describe a valid snapshot shape", () => {
  const options: PlanOptions = {
    olderThanDays: 30,
    deleteUntagged: true,
    excludeTags: ["latest"],
  };
  const snapshot: PackageSnapshot = {
    packageName: "acme/example",
    scanCompletedAt: "2026-04-20T12:00:00.000Z",
    packageVersions: [],
    tags: [],
    manifests: [],
    manifestEdges: [],
  };

  assert.equal(options.olderThanDays, 30);
  assert.equal(snapshot.packageName, "acme/example");
});
