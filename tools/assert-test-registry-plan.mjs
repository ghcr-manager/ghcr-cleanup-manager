#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const fixture = process.argv[2];
const planPath = process.argv[3];

if (fixture !== "single" && fixture !== "complex") {
  throw new Error("usage: node tools/assert-test-registry-plan.mjs <single|complex> <plan-path>");
}

if (!planPath) {
  throw new Error("missing required <plan-path> argument");
}

const plan = JSON.parse(readFileSync(planPath, "utf8"));
assert.equal(plan.plannerInputs?.deleteUntagged, true);
assert.match(plan.packageName, new RegExp(`-test--${fixture}$`));
assert.ok(plan.scanCompletedAt, "scanCompletedAt must be populated");
assert.deepEqual(plan.directTargetTags, []);
assert.deepEqual(plan.collateralTags, []);

if (fixture === "single") {
  assert.deepEqual(plan.directTargetRoots, []);
  assert.deepEqual(plan.closureManifests, []);
  assert.deepEqual(plan.blockedRoots, []);
  assert.deepEqual(plan.fullyDeletableRoots, []);
}

if (fixture === "complex") {
  assert.ok(plan.directTargetRoots.length > 0, "complex fixture must have direct target roots");
  assert.equal(plan.fullyDeletableRoots.length, 0, "complex fixture must have zero fully deletable roots");
  assert.ok(plan.blockedRoots.length > 0, "complex fixture must have blocked roots");
  assert.ok(plan.closureManifests.length >= plan.directTargetRoots.length, "complex fixture must have closure rows");

  for (const root of plan.directTargetRoots) {
    assert.equal(root.reason, "delete-untagged");
    assert.equal(root.selectionMode, "delete-root");
  }

  const directTargetDigests = new Set(plan.directTargetRoots.map((root) => root.digest));
  const closureSourceDigests = new Set(plan.closureManifests.map((manifest) => manifest.sourceDigest));
  const blockedDigests = new Set(plan.blockedRoots.map((root) => root.blockedDigest));

  assert.deepEqual(
    [...closureSourceDigests].sort(),
    [...directTargetDigests].sort(),
    "complex closure rows must cover every direct target root"
  );
  assert.deepEqual(
    [...blockedDigests].sort(),
    [...directTargetDigests].sort(),
    "complex direct target roots must all be blocked"
  );

  for (const blockedRoot of plan.blockedRoots) {
    assert.equal(blockedRoot.reason, "overlap-with-retained-root");
    assert.ok(
      directTargetDigests.has(blockedRoot.blockedDigest),
      "blocked root digest must come from the direct target set"
    );
  }
}

console.error(`validated delete-untagged plan for fixture '${fixture}'`);
