import assert from "node:assert/strict";
import test from "node:test";
import type { PlanSummary } from "../../src/core/index.js";

test("core index re-exports public types", () => {
  const summary: PlanSummary = {
    packageName: "acme/example",
    scanCompletedAt: "2026-04-20T12:00:00.000Z",
    totalPackageVersions: 1,
    totalTaggedVersions: 1,
    protectedVersionIds: [1],
    deletableVersionIds: [],
  };

  assert.equal(summary.totalTaggedVersions, 1);
});
