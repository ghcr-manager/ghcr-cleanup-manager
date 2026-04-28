import assert from "node:assert/strict";
import test from "node:test";
import { loadRegistryPullToken } from "../../../src/ingest/github/_registry-token-client.js";

test("registry token client requests a pull token with optional basic auth", async () => {
  let seenAuthorization: string | undefined;

  const token = await loadRegistryPullToken(
    async (input, init) => {
      assert.equal(input, "https://ghcr.test/token?service=ghcr.test&scope=repository%3Aacme%2Fexample%3Apull");
      seenAuthorization = (init?.headers as Record<string, string>).Authorization;

      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        async json() {
          return { token: "registry-token" };
        },
      };
    },
    "https://ghcr.test",
    { owner: "acme", packageName: "example", token: "secret-token" },
  );

  assert.equal(token, "registry-token");
  assert.equal(seenAuthorization, `Basic ${Buffer.from("acme:secret-token").toString("base64")}`);
});

test("registry token client omits auth for anonymous access", async () => {
  const token = await loadRegistryPullToken(
    async (_input, init) => {
      assert.equal((init?.headers as Record<string, string>).Authorization, undefined);

      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        async json() {
          return { token: "public-token" };
        },
      };
    },
    "https://ghcr.test",
    { owner: "acme", packageName: "example" },
  );

  assert.equal(token, "public-token");
});
