import assert from "node:assert/strict";
import test from "node:test";
import { deletePackageVersionForOrg } from "../../src/execute/_package-version-delete-client.js";

test("deletePackageVersionForOrg deletes a package version via the org endpoint", async () => {
  const calls: Array<{ url: string; method?: string }> = [];

  await deletePackageVersionForOrg(
    "acme",
    "example",
    42,
    "token",
    {
      debug() {},
      info() {},
      warn() {},
      error() {}
    },
    {
      githubApiBaseUrl: "https://api.github.test",
      fetchImpl: async (input, init) => {
        calls.push({
          url: String(input),
          method: init?.method
        });
        return {
          ok: true,
          status: 204,
          headers: new Headers(),
          async json() {
            return {};
          }
        };
      }
    }
  );

  assert.deepEqual(calls, [
    {
      url: "https://api.github.test/orgs/acme/packages/container/example/versions/42",
      method: "DELETE"
    }
  ]);
});

test("deletePackageVersionForOrg surfaces GitHub error details", async () => {
  await assert.rejects(
    () =>
      deletePackageVersionForOrg(
        "acme",
        "example",
        42,
        "token",
        {
          debug() {},
          info() {},
          warn() {},
          error() {}
        },
        {
          githubApiBaseUrl: "https://api.github.test",
          fetchImpl: async () => ({
            ok: false,
            status: 404,
            headers: new Headers({ "content-type": "application/json" }),
            async json() {
              return {
                message: "Not Found",
                documentation_url: "https://docs.github.com/rest/packages/packages"
              };
            }
          })
        }
      ),
    /GitHub package delete request failed for version 42 - status 404 - Not Found - https:\/\/docs\.github\.com\/rest\/packages\/packages/
  );
});

test("deletePackageVersionForOrg sends the expected headers and surfaces transport failures", async () => {
  const headersSeen: Headers[] = [];

  await deletePackageVersionForOrg(
    "acme",
    "example",
    42,
    "token",
    {
      debug() {},
      info() {},
      warn() {},
      error() {}
    },
    {
      githubApiBaseUrl: "https://api.github.test",
      fetchImpl: async (_input, init) => {
        headersSeen.push(new Headers(init?.headers));
        return {
          ok: true,
          status: 204,
          headers: new Headers(),
          async json() {
            return {};
          }
        };
      }
    }
  );

  assert.equal(headersSeen.length, 1);
  assert.equal(headersSeen[0]?.get("accept"), "application/vnd.github+json");
  assert.equal(headersSeen[0]?.get("authorization"), "Bearer token");
  assert.equal(headersSeen[0]?.get("user-agent"), "ghcr-manager");
  assert.equal(headersSeen[0]?.get("x-github-api-version"), "2022-11-28");

  await assert.rejects(
    () =>
      deletePackageVersionForOrg(
        "acme",
        "example",
        42,
        "token",
        {
          debug() {},
          info() {},
          warn() {},
          error() {}
        },
        {
          githubApiBaseUrl: "https://api.github.test",
          fetchImpl: async () => {
            throw new TypeError("fetch failed", {
              cause: Object.assign(new Error("socket hang up"), { code: "ECONNRESET" })
            });
          }
        }
      ),
    /GitHub package delete request failed for version 42 - fetch failed/
  );
});

test("deletePackageVersionForOrg retries retryable HTTP failures", async () => {
  const originalSetTimeout = globalThis.setTimeout;
  const warnings: string[] = [];
  let attempts = 0;
  globalThis.setTimeout = ((callback: (...args: unknown[]) => void) => {
    callback();
    return 0;
  }) as unknown as typeof setTimeout;

  try {
    await deletePackageVersionForOrg(
      "acme",
      "example",
      42,
      "token",
      {
        debug() {},
        info() {},
        warn(message) {
          warnings.push(message);
        },
        error() {}
      },
      {
        githubApiBaseUrl: "https://api.github.test",
        fetchImpl: async () => {
          attempts += 1;
          if (attempts === 1) {
            return {
              ok: false,
              status: 503,
              headers: new Headers({ "content-type": "application/json" }),
              async json() {
                return { message: "Service Unavailable" };
              }
            };
          }
          return {
            ok: true,
            status: 204,
            headers: new Headers(),
            async json() {
              return {};
            }
          };
        }
      }
    );

    assert.equal(attempts, 2);
    assert.match(
      warnings[0] ?? "",
      /GitHub package delete request for version 42 failed on attempt 1\/4; retrying in 1000ms - GitHub package delete request failed for version 42 - status 503 - Service Unavailable/
    );
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }
});
