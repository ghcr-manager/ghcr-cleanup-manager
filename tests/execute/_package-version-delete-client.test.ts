import assert from "node:assert/strict";
import test from "node:test";
import { deletePackageVersion } from "../../src/execute/_package-version-delete-client.js";

test("deletePackageVersion deletes a package version via the org endpoint", async () => {
  const calls: Array<{ url: string; method?: string }> = [];

  await deletePackageVersion(
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
      fetchImpl: async (input, init) => {
        if (input === "https://api.github.com/users/acme") {
          return {
            ok: true,
            status: 200,
            headers: new Headers(),
            async json() {
              return { type: "Organization" };
            }
          };
        }
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
      url: "https://api.github.com/orgs/acme/packages/container/example/versions/42",
      method: "DELETE"
    }
  ]);
});

test("deletePackageVersion deletes a package version via the user endpoint", async () => {
  const calls: Array<{ url: string; method?: string }> = [];

  await deletePackageVersion(
    "wuodan",
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
      fetchImpl: async (input, init) => {
        if (input === "https://api.github.com/users/wuodan") {
          return {
            ok: true,
            status: 200,
            headers: new Headers(),
            async json() {
              return { type: "User" };
            }
          };
        }
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
      url: "https://api.github.com/users/wuodan/packages/container/example/versions/42",
      method: "DELETE"
    }
  ]);
});

test("deletePackageVersion surfaces GitHub error details", async () => {
  await assert.rejects(
    () =>
      deletePackageVersion(
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
          fetchImpl: async (input) =>
            input === "https://api.github.com/users/acme"
              ? {
                  ok: true,
                  status: 200,
                  headers: new Headers(),
                  async json() {
                    return { type: "Organization" };
                  }
                }
              : {
                  ok: false,
                  status: 404,
                  headers: new Headers({ "content-type": "application/json" }),
                  async json() {
                    return {
                      message: "Not Found",
                      documentation_url: "https://docs.github.com/rest/packages/packages"
                    };
                  }
                }
        }
      ),
    /GitHub package delete request failed for version 42 - status 404 - Not Found - https:\/\/docs\.github\.com\/rest\/packages\/packages/
  );
});

test("deletePackageVersion sends the expected headers and surfaces transport failures", async () => {
  const headersSeen: Headers[] = [];

  await deletePackageVersion(
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
      fetchImpl: async (input, init) => {
        if (input === "https://api.github.com/users/acme") {
          return {
            ok: true,
            status: 200,
            headers: new Headers(),
            async json() {
              return { type: "Organization" };
            }
          };
        }
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
  assert.equal(headersSeen[0]?.get("user-agent"), "ghcr-cleanup-manager");
  assert.equal(headersSeen[0]?.get("x-github-api-version"), "2022-11-28");

  await assert.rejects(
    () =>
      deletePackageVersion(
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
          fetchImpl: async (input) => {
            if (input === "https://api.github.com/users/acme") {
              return {
                ok: true,
                status: 200,
                headers: new Headers(),
                async json() {
                  return { type: "Organization" };
                }
              };
            }
            throw new TypeError("fetch failed", {
              cause: Object.assign(new Error("socket hang up"), { code: "ECONNRESET" })
            });
          }
        }
      ),
    /GitHub package delete request failed for version 42 - fetch failed/
  );
});

test("deletePackageVersion retries retryable HTTP failures", async () => {
  const originalSetTimeout = globalThis.setTimeout;
  const warnings: string[] = [];
  let attempts = 0;
  globalThis.setTimeout = ((callback: (...args: unknown[]) => void) => {
    callback();
    return 0;
  }) as unknown as typeof setTimeout;

  try {
    await deletePackageVersion(
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
        fetchImpl: async (input) => {
          if (input === "https://api.github.com/users/acme") {
            return {
              ok: true,
              status: 200,
              headers: new Headers(),
              async json() {
                return { type: "Organization" };
              }
            };
          }
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
