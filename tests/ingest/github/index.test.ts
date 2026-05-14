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
      "https://api.github.com/orgs/acme/packages/container/example/versions?per_page=100&page=1",
      {
        body: [
          {
            id: 101,
            name: "sha256:index",
            created_at: "2026-04-01T00:00:00.000Z",
            updated_at: "2026-04-02T00:00:00.000Z",
            metadata: {
              container: {
                tags: ["latest"]
              }
            }
          },
          {
            id: 102,
            name: "sha256:attestation",
            created_at: "2026-03-01T00:00:00.000Z",
            updated_at: "2026-03-02T00:00:00.000Z",
            metadata: {
              container: {
                tags: []
              }
            }
          }
        ]
      }
    ],
    [
      "https://ghcr.io/token?service=ghcr.io&scope=repository%3Aacme%2Fexample%3Apull",
      {
        body: {
          token: "registry-token",
          expires_in: 3600
        }
      }
    ],
    [
      "https://ghcr.io/v2/acme/example/manifests/sha256:index",
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
                os: "linux"
              }
            }
          ]
        }
      }
    ],
    [
      "https://ghcr.io/v2/acme/example/manifests/sha256:attestation",
      {
        contentType: "application/vnd.oci.artifact.manifest.v1+json",
        body: {
          mediaType: "application/vnd.oci.artifact.manifest.v1+json",
          artifactType: "application/vnd.in-toto+json",
          annotations: {
            "dev.sigstore.bundle.content": "dsse-envelope"
          },
          config: {
            mediaType: "application/vnd.oci.empty.v1+json"
          },
          subject: {
            digest: "sha256:index"
          }
        }
      }
    ],
    [
      "https://api.github.com/orgs/acme/packages/container/example/versions?per_page=100&page=2",
      {
        body: []
      }
    ]
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
        }
      }
    },
    writer,
    repository,
    {
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
          }
        };
      }
    }
  );
  const scanId = writer.getActiveScanId();

  const metadata = repository.getPackageMetadata(scanId);
  assert.equal(metadata.owner, "acme");
  assert.equal(metadata.packageName, "example");
  assert.deepEqual(repository.listPackageVersionManifestRefs(scanId), [
    { versionId: 101, digest: "sha256:index" },
    { versionId: 102, digest: "sha256:attestation" }
  ]);
  assert.equal(repository.countTags(scanId), 1);
  assert.equal(repository.countManifests(scanId), 2);
  assert.equal(repository.countManifestEdges(scanId), 1);
  assert.equal(tokenRequestCount, 1);
  assert.equal(
    (database.prepare("SELECT COUNT(*) AS total FROM manifest_descriptors").get() as { total: number }).total,
    1
  );
  assert.equal(
    (database.prepare("SELECT COUNT(*) AS total FROM package_version_payloads").get() as { total: number }).total,
    2
  );
  assert.equal(
    (database.prepare("SELECT COUNT(*) AS total FROM manifest_payloads").get() as { total: number }).total,
    2
  );
  assert.deepEqual(database.prepare("SELECT missing_digest, anchor_digest FROM v_missing_digests").get(), {
    missing_digest: "sha256:child",
    anchor_digest: "sha256:index"
  });
  assert.match(
    (
      database.prepare("SELECT raw_json FROM manifest_payloads WHERE digest = 'sha256:index'").get() as {
        raw_json: string;
      }
    ).raw_json,
    /"manifests":\[/
  );
  assert.deepEqual(
    database
      .prepare(
        `
          SELECT config_media_type, subject_digest, annotations_json
               , manifest_kind
          FROM manifests
          WHERE digest = 'sha256:attestation'
        `
      )
      .get(),
    {
      config_media_type: "application/vnd.oci.empty.v1+json",
      subject_digest: "sha256:index",
      annotations_json: '{"dev.sigstore.bundle.content":"dsse-envelope"}',
      manifest_kind: "attestation_manifest"
    }
  );
  assert.equal(
    (database.prepare("SELECT COUNT(*) AS total FROM manifest_reachability").get() as { total: number }).total,
    3
  );
  assert.deepEqual(
    progressMessages.filter((message) => message.startsWith("info:")),
    [
      "info:Starting GitHub package scan for acme/example",
      "info:Starting remote data pull for acme/example",
      "info:Loaded GitHub package-version pages 1 (2 items total)",
      "info:Loaded 2 package versions and 1 tags",
      "info:Fetching manifests for 2 package versions",
      "info:Fetched manifests 1/2",
      "info:Fetched manifests 2/2",
      "info:Starting manifest graph processing for 2 manifest payloads",
      "info:Inserted 1 manifest edges; rebuilding reachability",
      "info:Completed manifest graph processing",
      "info:Completed remote data pull for acme/example",
      "info:Completed GitHub package scan for acme/example"
    ]
  );

  database.close();
});
