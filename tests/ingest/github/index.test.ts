import assert from "node:assert/strict";
import test from "node:test";
import { openDatabase, ScanWriter, SnapshotRepository } from "../../../src/db/index.js";
import { importGitHubScan } from "../../../src/ingest/github/index.js";

test("GitHub ingest writes package and manifest data directly into SQLite", async () => {
  const responses = new Map<
    string,
    {
      body: unknown;
      contentType?: string;
    }
  >([
    [
      "https://api.github.test/orgs/acme/packages/container/example/versions?per_page=100&page=1",
      {
        body: [
          {
            id: 101,
            name: "sha256:index",
            created_at: "2026-04-01T00:00:00.000Z",
            updated_at: "2026-04-02T00:00:00.000Z",
            metadata: {
              container: {
                tags: ["latest"],
              },
            },
          },
          {
            id: 102,
            name: "sha256:attestation",
            created_at: "2026-03-01T00:00:00.000Z",
            updated_at: "2026-03-02T00:00:00.000Z",
            metadata: {
              container: {
                tags: [],
              },
            },
          },
        ],
      },
    ],
    [
      "https://ghcr.test/token?service=ghcr.test&scope=repository%3Aacme%2Fexample%3Apull",
      {
        body: {
          token: "registry-token",
        },
      },
    ],
    [
      "https://ghcr.test/v2/acme/example/manifests/sha256:index",
      {
        contentType: "application/vnd.oci.image.index.v1+json",
        body: {
          mediaType: "application/vnd.oci.image.index.v1+json",
          manifests: [
            {
              digest: "sha256:child",
              mediaType: "application/vnd.oci.image.manifest.v1+json",
              platform: {
                architecture: "amd64",
                os: "linux",
              },
            },
          ],
        },
      },
    ],
    [
      "https://ghcr.test/v2/acme/example/manifests/sha256:attestation",
      {
        contentType: "application/vnd.oci.artifact.manifest.v1+json",
        body: {
          mediaType: "application/vnd.oci.artifact.manifest.v1+json",
          artifactType: "application/vnd.in-toto+json",
          subject: {
            digest: "sha256:index",
          },
        },
      },
    ],
    [
      "https://api.github.test/orgs/acme/packages/container/example/versions?per_page=100&page=2",
      {
        body: [],
      },
    ],
  ]);

  const database = openDatabase(":memory:");
  const writer = new ScanWriter(database);
  const repository = new SnapshotRepository(database);

  await importGitHubScan(
    {
      owner: "acme",
      packageName: "example",
      token: "test-token",
      githubApiBaseUrl: "https://api.github.test",
      registryBaseUrl: "https://ghcr.test",
      fetchImpl: async (input, init) => {
        const response = responses.get(input);
        if (!response) {
          throw new Error(`unexpected request: ${input}`);
        }

        assert.ok(init?.headers);
        if (input.includes("/manifests/")) {
          assert.equal((init.headers as Record<string, string>).Authorization, "Bearer registry-token");
        }

        return {
          ok: true,
          status: 200,
          headers: new Headers(response.contentType ? { "content-type": response.contentType } : {}),
          async json() {
            return response.body;
          },
        };
      },
    },
    writer,
    repository,
  );

  assert.equal(repository.getPackageMetadata().packageName, "acme/example");
  assert.deepEqual(repository.listPackageVersionDigests(), ["sha256:index", "sha256:attestation"]);
  assert.equal(repository.countTags(), 1);
  assert.equal(repository.countManifests(), 3);
  assert.equal(repository.countManifestEdges(), 2);

  database.close();
});
