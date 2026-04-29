import assert from "node:assert/strict";
import test from "node:test";
import { manifestFetchConcurrency, packageVersionPageFetchConcurrency } from "../../src/tuning/index.js";

test("tuning exports ingest concurrency constants", () => {
  assert.equal(typeof packageVersionPageFetchConcurrency, "number");
  assert.ok(packageVersionPageFetchConcurrency >= 1);
  assert.equal(typeof manifestFetchConcurrency, "number");
  assert.ok(manifestFetchConcurrency >= 1);
});
