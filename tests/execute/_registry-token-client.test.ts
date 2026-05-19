import assert from "node:assert/strict";
import test from "node:test";
import { loadRegistryPushToken } from "../../src/execute/_registry-token-client.js";

test("loadRegistryPushToken requests a push-capable token", async () => {
  const calls: string[] = [];
  const token = await loadRegistryPushToken(
    "acme",
    "example",
    "github-token",
    {
      debug() {},
      info() {},
      warn() {},
      error() {}
    },
    {
      fetchImpl: async (input) => {
        calls.push(String(input));
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          async json() {
            return { token: "registry-token" };
          }
        };
      }
    }
  );

  assert.equal(token, "registry-token");
  assert.deepEqual(calls, ["https://ghcr.io/token?service=ghcr.io&scope=repository%3Aacme%2Fexample%3Apull%2Cpush"]);
});

test("loadRegistryPushToken surfaces non-retryable HTTP failures", async () => {
  await assert.rejects(
    () =>
      loadRegistryPushToken(
        "acme",
        "example",
        "github-token",
        {
          debug() {},
          info() {},
          warn() {},
          error() {}
        },
        {
          fetchImpl: async () => ({
            ok: false,
            status: 401,
            headers: new Headers({
              "content-type": "application/json",
              "www-authenticate": 'Bearer realm="test"'
            }),
            async json() {
              return { message: "unauthorized" };
            }
          })
        }
      ),
    /GHCR token request failed - status 401 - unauthorized - www-authenticate: Bearer realm="test"/
  );
});

test("loadRegistryPushToken rejects responses without a token", async () => {
  await assert.rejects(
    () =>
      loadRegistryPushToken(
        "acme",
        "example",
        "github-token",
        {
          debug() {},
          info() {},
          warn() {},
          error() {}
        },
        {
          fetchImpl: async () => ({
            ok: true,
            status: 200,
            headers: new Headers({ "content-type": "application/json" }),
            async json() {
              return {};
            }
          })
        }
      ),
    /GHCR token response did not include a token/
  );
});

test("loadRegistryPushToken surfaces transport failures", async () => {
  await assert.rejects(
    () =>
      loadRegistryPushToken(
        "acme",
        "example",
        "github-token",
        {
          debug() {},
          info() {},
          warn() {},
          error() {}
        },
        {
          fetchImpl: async () => {
            throw new TypeError("fetch failed", {
              cause: Object.assign(new Error("socket hang up"), { code: "ECONNRESET" })
            });
          }
        }
      ),
    /GHCR token request failed - fetch failed/
  );
});
