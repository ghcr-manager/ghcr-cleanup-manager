import assert from "node:assert/strict";
import test from "node:test";
import { loadPackageMetadata } from "../../../src/ingest/github/index.js";

function _createLogger() {
  return { debug() {}, info() {}, warn() {}, error() {} };
}

test("package metadata loader returns raw package metadata json", async () => {
  const metadata = await loadPackageMetadata(
    async (input, init) => {
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
      assert.equal(input, "https://api.github.com/orgs/acme/packages/container/example");
      assert.deepEqual(init?.headers, {
        Accept: "application/vnd.github+json",
        Authorization: "Bearer token",
        "User-Agent": "ghcr-cleanup-manager",
        "X-GitHub-Api-Version": "2022-11-28"
      });
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        async json() {
          return {
            visibility: "internal"
          };
        }
      };
    },
    {
      owner: "acme",
      packageName: "example",
      token: "token",
      logger: _createLogger()
    }
  );

  assert.deepEqual(metadata, {
    rawJson: JSON.stringify({ visibility: "internal" })
  });
});

test("package metadata loader surfaces non-retryable HTTP failures", async () => {
  await assert.rejects(
    () =>
      loadPackageMetadata(
        async (input) =>
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
                    message: "Not Found"
                  };
                }
              },
        {
          owner: "acme",
          packageName: "example",
          token: "token",
          logger: _createLogger()
        }
      ),
    /GitHub package metadata request failed - status 404 - Not Found/
  );
});

test("package metadata loader retries retryable statuses", async () => {
  const originalSetTimeout = globalThis.setTimeout;
  const warnings: string[] = [];
  let packageAttempts = 0;
  globalThis.setTimeout = ((callback: (...args: unknown[]) => void) => {
    callback();
    return 0;
  }) as unknown as typeof setTimeout;

  try {
    const metadata = await loadPackageMetadata(
      async (input) => {
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
        packageAttempts += 1;
        if (packageAttempts === 1) {
          return {
            ok: false,
            status: 429,
            headers: new Headers({ "content-type": "application/json" }),
            async json() {
              return {
                message: "rate limited"
              };
            }
          };
        }

        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          async json() {
            return {
              visibility: "private"
            };
          }
        };
      },
      {
        owner: "acme",
        packageName: "example",
        token: "token",
        logger: {
          debug() {},
          info() {},
          warn(message) {
            warnings.push(message);
          },
          error() {}
        }
      }
    );

    assert.deepEqual(metadata, {
      rawJson: JSON.stringify({ visibility: "private" })
    });
    assert.equal(packageAttempts, 2);
    assert.match(warnings[0] ?? "", /GitHub package metadata request failed on attempt 1\/4; retrying in 1000ms/);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }
});

test("package metadata loader surfaces transport failures", async () => {
  await assert.rejects(
    () =>
      loadPackageMetadata(
        async (input) => {
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
        },
        {
          owner: "acme",
          packageName: "example",
          token: "token",
          logger: _createLogger()
        }
      ),
    /GitHub package metadata request failed - fetch failed - socket hang up \(ECONNRESET\)/
  );
});

test("package metadata loader supports user-owned packages", async () => {
  let seenUrl = "";

  const metadata = await loadPackageMetadata(
    async (input) => {
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
      seenUrl = String(input);
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        async json() {
          return {
            visibility: "public"
          };
        }
      };
    },
    {
      owner: "wuodan",
      packageName: "example",
      token: "token",
      logger: _createLogger()
    }
  );

  assert.equal(seenUrl, "https://api.github.com/users/wuodan/packages/container/example");
  assert.equal(metadata.rawJson, JSON.stringify({ visibility: "public" }));
});
