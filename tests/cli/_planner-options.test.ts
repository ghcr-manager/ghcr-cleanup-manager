import assert from "node:assert/strict";
import test from "node:test";
import { resolvePlanCommandInputs } from "../../src/cli/_planner-options.js";

test("resolvePlanCommandInputs parses delete-untagged inputs", () => {
  const inputs = resolvePlanCommandInputs([
    "--db",
    "scan.sqlite",
    "--owner",
    "acme",
    "--package",
    "example",
    "--delete-untagged"
  ]);

  assert.equal(inputs.databasePath, "scan.sqlite");
  assert.equal(inputs.owner, "acme");
  assert.equal(inputs.packageName, "example");
  assert.equal(inputs.deleteUntagged, true);
  assert.equal(inputs.deleteTagsRequested, false);
});

test("resolvePlanCommandInputs rejects exclude-tag for keep-n-untagged", () => {
  assert.throws(
    () =>
      resolvePlanCommandInputs([
        "--db",
        "scan.sqlite",
        "--owner",
        "acme",
        "--package",
        "example",
        "--keep-n-untagged",
        "1",
        "--exclude-tag",
        "latest"
      ]),
    /--exclude-tag is only supported with tagged selector families/
  );
});

test("resolvePlanCommandInputs parses use-regex for tagged selectors", () => {
  const inputs = resolvePlanCommandInputs([
    "--db",
    "scan.sqlite",
    "--owner",
    "acme",
    "--package",
    "example",
    "--delete-tag",
    "^latest$",
    "--use-regex"
  ]);

  assert.equal(inputs.useRegex, true);
  assert.equal(inputs.deleteTagsRequested, true);
  assert.deepEqual(inputs.deleteTags, ["^latest$"]);
});
