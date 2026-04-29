import assert from "node:assert/strict";
import test from "node:test";
import { openDatabase, ScanWriter, SnapshotRepository } from "../../../src/db/index.js";
import { importGitHubScan } from "../../../src/ingest/github/index.js";

test("GitHub ingest writes package and manifest data directly into SQLite", async () => {
  const progressMessages: string[] = [];
  let tokenRequestCount = 0;
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
          expires_in: 3600,
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
      "https://ghcr.test/v2/acme/example/manifests/sha256:child",
      {
        contentType: "application/vnd.oci.image.manifest.v1+json",
        body: {
          mediaType: "application/vnd.oci.image.manifest.v1+json",
          config: {
            mediaType: "application/vnd.oci.image.config.v1+json",
          },
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
          annotations: {
            "dev.sigstore.bundle.content": "dsse-envelope",
          },
          config: {
            mediaType: "application/vnd.oci.empty.v1+json",
          },
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
      logger: {
        debug(message) {
          progressMessages.push(`debug:${message}`);
        },
        info(message) {
          progressMessages.push(`info:${message}`);
        },
        warn(message) {
          progressMessages.push(`warn:${message}`);
        },
        error(message) {
          progressMessages.push(`error:${message}`);
        },
      },
      githubApiBaseUrl: "https://api.github.test",
      registryBaseUrl: "https://ghcr.test",
      fetchImpl: async (input, init) => {
        const response = responses.get(input);
        if (!response) {
          throw new Error(`unexpected request: ${input}`);
        }

        assert.ok(init?.headers);
        if (input.includes("/token?")) {
          tokenRequestCount += 1;
        }
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
  assert.equal(tokenRequestCount, 1);
  assert.equal(
    (database.prepare("SELECT COUNT(*) AS total FROM manifest_descriptors").get() as { total: number }).total,
    1,
  );
  assert.equal(
    (database.prepare("SELECT COUNT(*) AS total FROM package_version_payloads").get() as { total: number }).total,
    2,
  );
  assert.equal(
    (database.prepare("SELECT COUNT(*) AS total FROM manifest_payloads").get() as { total: number }).total,
    3,
  );
  assert.match(
    (
      database.prepare("SELECT raw_json FROM manifest_payloads WHERE digest = 'sha256:index'").get() as {
        raw_json: string;
      }
    ).raw_json,
    /"manifests":\[/,
  );
  assert.deepEqual(
    database
      .prepare(
        `
          SELECT config_media_type, subject_digest, annotations_json
          FROM manifests
          WHERE digest = 'sha256:attestation'
        `,
      )
      .get(),
    {
      config_media_type: "application/vnd.oci.empty.v1+json",
      subject_digest: "sha256:index",
      annotations_json: '{"dev.sigstore.bundle.content":"dsse-envelope"}',
    },
  );
  assert.equal(
    (database.prepare("SELECT COUNT(*) AS total FROM manifest_reachability").get() as { total: number }).total,
    5,
  );
  assert.deepEqual(
    progressMessages.filter((message) => message.startsWith("info:")),
    [
      "info:Starting GitHub package scan for acme/example",
      "info:Loaded GitHub package-version pages 1 (2 items total)",
      "info:Loaded 2 package versions and 1 tags",
      "info:Fetching manifests for 2 package versions",
      "info:Fetched manifests 3/3",
      "info:Completed GitHub package scan for acme/example",
    ],
  );

  database.close();
});
