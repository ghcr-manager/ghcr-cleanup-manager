import assert from "node:assert/strict";
import test from "node:test";
import { loadPackageVersionPage } from "../../../src/ingest/github/_package-version-page-load.js";

test("package version page loader requests the expected page", async () => {
  let seenUrl = "";

  const items = await loadPackageVersionPage(
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
      seenUrl = input;
      assert.equal((init?.headers as Record<string, string>)["X-GitHub-Api-Version"], "2022-11-28");
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        async json() {
          return [
            {
              id: 7,
              name: "sha256:x",
              created_at: "2026-04-01T00:00:00.000Z",
              updated_at: "2026-04-01T00:00:00.000Z",
              metadata: { container: { tags: ["latest"] } }
            }
          ];
        }
      };
    },
    {
      owner: "acme",
      packageName: "example",
      token: "token",
      logger: { debug() {}, info() {}, warn() {}, error() {} }
    },
    3
  );

  assert.equal(seenUrl, "https://api.github.com/orgs/acme/packages/container/example/versions?per_page=100&page=3");
  assert.equal(items[0]?.id, 7);
});

test("package version page loader surfaces fetch transport failures with page context", async () => {
  await assert.rejects(
    () =>
      loadPackageVersionPage(
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
          throw new TypeError("fetch failed");
        },
        {
          owner: "acme",
          packageName: "example",
          token: "token",
          logger: { debug() {}, info() {}, warn() {}, error() {} }
        },
        9
      ),
    /GitHub Packages request for page 9 failed - fetch failed/
  );
});

test("package version page loader supports user-owned packages", async () => {
  let seenUrl = "";

  await loadPackageVersionPage(
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
      seenUrl = input;
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        async json() {
          return [];
        }
      };
    },
    {
      owner: "wuodan",
      packageName: "example",
      token: "token",
      logger: { debug() {}, info() {}, warn() {}, error() {} }
    },
    1
  );

  assert.equal(seenUrl, "https://api.github.com/users/wuodan/packages/container/example/versions?per_page=100&page=1");
});
