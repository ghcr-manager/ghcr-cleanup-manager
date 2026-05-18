import assert from "node:assert/strict";
import test from "node:test";
import { loadPackageMetadata } from "../../../src/ingest/github/index.js";

function _createLogger() {
  return { debug() {}, info() {}, warn() {}, error() {} };
}

test("package metadata loader returns whether the package is public", async () => {
  const metadata = await loadPackageMetadata(
    async (input, init) => {
      assert.equal(input, "https://api.github.test/orgs/acme/packages/container/example");
      assert.deepEqual(init?.headers, {
        Accept: "application/vnd.github+json",
        Authorization: "Bearer token",
        "User-Agent": "ghcr-manager",
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
    "https://api.github.test",
    {
      owner: "acme",
      packageName: "example",
      token: "token",
      logger: _createLogger()
    }
  );

  assert.deepEqual(metadata, { isPublic: false });
});

test("package metadata loader rejects unsupported visibility values", async () => {
  await assert.rejects(
    () =>
      loadPackageMetadata(
        async () => ({
          ok: true,
          status: 200,
          headers: new Headers(),
          async json() {
            return {
              visibility: "secret"
            };
          }
        }),
        "https://api.github.test",
        {
          owner: "acme",
          packageName: "example",
          token: "token",
          logger: _createLogger()
        }
      ),
    /GitHub package metadata response did not include a supported visibility value/
  );
});

test("package metadata loader returns true for public packages", async () => {
  const metadata = await loadPackageMetadata(
    async () => ({
      ok: true,
      status: 200,
      headers: new Headers(),
      async json() {
        return {
          visibility: "public"
        };
      }
    }),
    "https://api.github.test",
    {
      owner: "acme",
      packageName: "example",
      token: "token",
      logger: _createLogger()
    }
  );

  assert.deepEqual(metadata, { isPublic: true });
});

test("package metadata loader surfaces non-retryable HTTP failures", async () => {
  await assert.rejects(
    () =>
      loadPackageMetadata(
        async () => ({
          ok: false,
          status: 404,
          headers: new Headers({ "content-type": "application/json" }),
          async json() {
            return {
              message: "Not Found"
            };
          }
        }),
        "https://api.github.test",
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
  let attempts = 0;
  globalThis.setTimeout = ((callback: (...args: unknown[]) => void) => {
    callback();
    return 0;
  }) as unknown as typeof setTimeout;

  try {
    const metadata = await loadPackageMetadata(
      async () => {
        attempts += 1;
        if (attempts === 1) {
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
      "https://api.github.test",
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

    assert.deepEqual(metadata, { isPublic: false });
    assert.equal(attempts, 2);
    assert.match(warnings[0] ?? "", /GitHub package metadata request failed on attempt 1\/4; retrying in 1000ms/);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }
});

test("package metadata loader surfaces transport failures", async () => {
  await assert.rejects(
    () =>
      loadPackageMetadata(
        async () => {
          throw new TypeError("fetch failed", {
            cause: Object.assign(new Error("socket hang up"), { code: "ECONNRESET" })
          });
        },
        "https://api.github.test",
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
