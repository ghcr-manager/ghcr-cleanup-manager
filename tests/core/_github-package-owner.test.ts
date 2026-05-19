import assert from "node:assert/strict";
import test from "node:test";
import { getOwnerURIComponent } from "../../src/core/index.js";

test("GitHub owner lookup resolves organization and user URI components", async () => {
  const organizationOwnerURIComponent = await getOwnerURIComponent(
    async (input) => {
      assert.equal(input, "https://api.github.com/users/acme");
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        async json() {
          return { type: "Organization" };
        }
      };
    },
    "acme",
    "token",
    { warn() {} }
  );
  const userOwnerURIComponent = await getOwnerURIComponent(
    async () => ({
      ok: true,
      status: 200,
      headers: new Headers(),
      async json() {
        return { type: "User" };
      }
    }),
    "wuodan",
    "token",
    { warn() {} }
  );

  assert.equal(organizationOwnerURIComponent, "orgs/acme");
  assert.equal(userOwnerURIComponent, "users/wuodan");
});

test("GitHub owner lookup caches resolved owner URI components", async () => {
  let calls = 0;

  const firstOwnerURIComponent = await getOwnerURIComponent(
    async () => {
      calls += 1;
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        async json() {
          return { type: "Organization" };
        }
      };
    },
    "cached-owner",
    "token",
    { warn() {} }
  );
  const secondOwnerURIComponent = await getOwnerURIComponent(
    async () => {
      calls += 1;
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        async json() {
          return { type: "Organization" };
        }
      };
    },
    "cached-owner",
    "token",
    { warn() {} }
  );

  assert.equal(firstOwnerURIComponent, "orgs/cached-owner");
  assert.equal(secondOwnerURIComponent, "orgs/cached-owner");
  assert.equal(calls, 1);
});
