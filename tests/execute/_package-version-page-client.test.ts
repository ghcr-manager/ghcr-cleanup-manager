import assert from "node:assert/strict";
import test from "node:test";
import { findPackageVersionByDigestAndTag } from "../../src/execute/_package-version-page-client.js";

test("findPackageVersionByDigestAndTag finds a temporary version by digest and tag", async () => {
  const calls: string[] = [];
  const versionId = await findPackageVersionByDigestAndTag(
    "acme",
    "example",
    "sha256:detached",
    "latest",
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
            headers: new Headers({ "content-type": "application/json" }),
            async json() {
              return { type: "Organization" };
            }
          };
        }
        calls.push(String(input));
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          async json() {
            return [
              {
                id: 42,
                name: "sha256:detached",
                metadata: {
                  container: {
                    tags: ["latest"]
                  }
                }
              }
            ];
          }
        };
      }
    }
  );

  assert.equal(versionId, 42);
  assert.deepEqual(calls, ["https://api.github.com/orgs/acme/packages/container/example/versions?per_page=100&page=1"]);
});

test("findPackageVersionByDigestAndTag scans additional pages and matches tag membership", async () => {
  const calls: string[] = [];

  const versionId = await findPackageVersionByDigestAndTag(
    "acme",
    "example",
    "sha256:detached",
    "latest",
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
            headers: new Headers({ "content-type": "application/json" }),
            async json() {
              return { type: "Organization" };
            }
          };
        }
        const url = String(input);
        calls.push(url);
        if (url.endsWith("page=1")) {
          return {
            ok: true,
            status: 200,
            headers: new Headers({ "content-type": "application/json" }),
            async json() {
              return Array.from({ length: 100 }, (_, index) => ({
                id: index + 1,
                name: `sha256:other-${index}`,
                metadata: { container: { tags: ["latest"] } }
              }));
            }
          };
        }

        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          async json() {
            return [
              {
                id: 303,
                name: "sha256:detached",
                metadata: {
                  container: {
                    tags: ["latest", "keep-me"]
                  }
                }
              }
            ];
          }
        };
      }
    }
  );

  assert.equal(versionId, 303);
  assert.deepEqual(calls, [
    "https://api.github.com/orgs/acme/packages/container/example/versions?per_page=100&page=1",
    "https://api.github.com/orgs/acme/packages/container/example/versions?per_page=100&page=2"
  ]);
});

test("findPackageVersionByDigestAndTag retries visibility polling until the temporary version appears", async () => {
  const originalSetTimeout = globalThis.setTimeout;
  const warnings: string[] = [];
  let outerAttempts = 0;
  globalThis.setTimeout = ((callback: (...args: unknown[]) => void) => {
    callback();
    return 0;
  }) as unknown as typeof setTimeout;

  try {
    const versionId = await findPackageVersionByDigestAndTag(
      "acme",
      "example",
      "sha256:detached",
      "latest",
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
              headers: new Headers({ "content-type": "application/json" }),
              async json() {
                return { type: "Organization" };
              }
            };
          }
          outerAttempts += 1;
          return {
            ok: true,
            status: 200,
            headers: new Headers({ "content-type": "application/json" }),
            async json() {
              if (outerAttempts < 2) {
                return [];
              }
              return [
                {
                  id: 404,
                  name: "sha256:detached",
                  metadata: {
                    container: {
                      tags: ["latest"]
                    }
                  }
                }
              ];
            }
          };
        }
      }
    );

    assert.equal(versionId, 404);
    assert.equal(outerAttempts, 2);
    assert.match(
      warnings[0] ?? "",
      /Temporary package version for acme\/example:latest \(sha256:detached\) not visible yet; retrying lookup 1\/5/
    );
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }
});

test("findPackageVersionByDigestAndTag fails after exhausting visibility polling", async () => {
  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = ((callback: (...args: unknown[]) => void) => {
    callback();
    return 0;
  }) as unknown as typeof setTimeout;

  try {
    await assert.rejects(
      () =>
        findPackageVersionByDigestAndTag(
          "acme",
          "example",
          "sha256:detached",
          "latest",
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
                    headers: new Headers({ "content-type": "application/json" }),
                    async json() {
                      return { type: "Organization" };
                    }
                  }
                : {
                    ok: true,
                    status: 200,
                    headers: new Headers({ "content-type": "application/json" }),
                    async json() {
                      return [];
                    }
                  }
          }
        ),
      /could not find temporary package version for acme\/example:latest \(sha256:detached\)/
    );
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }
});

test("findPackageVersionByDigestAndTag surfaces non-retryable HTTP failures and transport failures", async () => {
  await assert.rejects(
    () =>
      findPackageVersionByDigestAndTag(
        "acme",
        "example",
        "sha256:detached",
        "latest",
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
                  headers: new Headers({ "content-type": "application/json" }),
                  async json() {
                    return { type: "Organization" };
                  }
                }
              : {
                  ok: false,
                  status: 404,
                  headers: new Headers({ "content-type": "application/json" }),
                  async json() {
                    return { message: "Not Found" };
                  }
                }
        }
      ),
    /GitHub Packages request for page 1 failed - status 404 - Not Found/
  );

  await assert.rejects(
    () =>
      findPackageVersionByDigestAndTag(
        "acme",
        "example",
        "sha256:detached",
        "latest",
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
                headers: new Headers({ "content-type": "application/json" }),
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
    /GitHub Packages request for page 1 failed - fetch failed/
  );
});

test("findPackageVersionByDigestAndTag supports user-owned packages", async () => {
  const calls: string[] = [];

  const versionId = await findPackageVersionByDigestAndTag(
    "wuodan",
    "example",
    "sha256:detached",
    "latest",
    "token",
    {
      debug() {},
      info() {},
      warn() {},
      error() {}
    },
    {
      fetchImpl: async (input) => {
        if (input === "https://api.github.com/users/wuodan") {
          return {
            ok: true,
            status: 200,
            headers: new Headers({ "content-type": "application/json" }),
            async json() {
              return { type: "User" };
            }
          };
        }
        calls.push(String(input));
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          async json() {
            return [
              {
                id: 42,
                name: "sha256:detached",
                metadata: {
                  container: {
                    tags: ["latest"]
                  }
                }
              }
            ];
          }
        };
      }
    }
  );

  assert.equal(versionId, 42);
  assert.deepEqual(calls, [
    "https://api.github.com/users/wuodan/packages/container/example/versions?per_page=100&page=1"
  ]);
});
