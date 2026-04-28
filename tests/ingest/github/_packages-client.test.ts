import assert from "node:assert/strict";
import test from "node:test";
import { openDatabase, ScanWriter, SnapshotRepository } from "../../../src/db/index.js";
import { ingestPackageVersions } from "../../../src/ingest/github/_packages-client.js";

test("package client writes package versions and tags page by page", async () => {
  const database = openDatabase(":memory:");
  const writer = new ScanWriter(database);
  const repository = new SnapshotRepository(database);
  let requests = 0;

  const counts = await ingestPackageVersions(
    async () => ({
      ok: true,
      status: 200,
      headers: new Headers(),
      async json() {
        requests += 1;
        if (requests === 1) {
          return [
            {
              id: 2,
              name: "sha256:b",
              created_at: "2026-04-01T00:00:00.000Z",
              updated_at: "2026-04-01T00:00:00.000Z",
              metadata: { container: { tags: ["latest"] } },
            },
          ];
        }
        return [];
      },
    }),
    "https://api.github.test",
    { owner: "acme", packageName: "example", token: "token" },
    writer,
  );

  assert.deepEqual(counts, { packageVersions: 1, tags: 1 });
  assert.deepEqual(repository.listPackageVersionDigests(), ["sha256:b"]);
  assert.equal(repository.countTags(), 1);

  database.close();
});

test("package client surfaces GitHub error details", async () => {
  const database = openDatabase(":memory:");
  const writer = new ScanWriter(database);

  await assert.rejects(
    () =>
      ingestPackageVersions(
        async () => ({
          ok: false,
          status: 401,
          headers: new Headers({ "content-type": "application/json" }),
          async json() {
            return {
              message: "Requires authentication",
              documentation_url: "https://docs.github.com/rest/packages/packages",
            };
          },
        }),
        "https://api.github.test",
        { owner: "acme", packageName: "example" },
        writer,
      ),
    /GitHub Packages request failed - status 401 - Requires authentication - https:\/\/docs\.github\.com\/rest\/packages\/packages/,
  );

  database.close();
});
