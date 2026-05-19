import assert from "node:assert/strict";
import test from "node:test";
import { ghcrRegistryBaseUrl, githubApiBaseUrl } from "../../src/core/index.js";

test("service URLs expose the fixed GitHub and GHCR base URLs", () => {
  assert.equal(githubApiBaseUrl, "https://api.github.com");
  assert.equal(ghcrRegistryBaseUrl, "https://ghcr.io");
});
