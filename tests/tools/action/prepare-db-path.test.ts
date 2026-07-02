import assert from "node:assert/strict";
import test from "node:test";

const { buildDbPath } = await import(new URL("../../../tools/action/prepare-db-path.mjs", import.meta.url).href);

test("buildDbPath maps slash-bearing package names to a readable DB filename", () => {
  const invocation = buildDbPath({
    OWNER: "sigstore",
    PACKAGE: "cosign/cosign",
    RUNNER_TEMP: "/tmp"
  });

  assert.match(invocation.dbPath, /^\/tmp\/ghcr-cleanup-manager-db-[^/]+\/sigstore__cosign__cosign\.sqlite$/);
  assert.equal(invocation.dbFile, "sigstore__cosign__cosign.sqlite");
});

test("buildDbPath preserves explicit DB paths", () => {
  const invocation = buildDbPath({
    INPUT_DB_PATH: "/tmp/custom/cosign.sqlite",
    OWNER: "sigstore",
    PACKAGE: "cosign/cosign"
  });

  assert.deepEqual(invocation, {
    dbFile: "cosign.sqlite",
    dbPath: "/tmp/custom/cosign.sqlite"
  });
});
