import assert from "node:assert/strict";
import test from "node:test";
import { loadSnapshotFromGitHub } from "../src/github-snapshot-source.js";

test("loadSnapshotFromGitHub builds snapshot from package and manifest responses", async () => {
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

  const snapshot = await loadSnapshotFromGitHub({
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

      return {
        ok: true,
        status: 200,
        headers: new Headers(response.contentType ? { "content-type": response.contentType } : {}),
        async json() {
          return response.body;
        },
      };
    },
  });

  assert.equal(snapshot.packageName, "acme/example");
  assert.deepEqual(
    snapshot.packageVersions.map((version) => version.versionId),
    [101, 102],
  );
  assert.deepEqual(snapshot.tags, [
    {
      tag: "latest",
      digest: "sha256:index",
      versionId: 101,
    },
  ]);
  assert.deepEqual(
    snapshot.manifests.map((manifest) => manifest.digest),
    ["sha256:attestation", "sha256:child", "sha256:index"],
  );
  assert.deepEqual(snapshot.manifestEdges, [
    {
      parentDigest: "sha256:index",
      childDigest: "sha256:attestation",
      edgeKind: "referrer",
    },
    {
      parentDigest: "sha256:index",
      childDigest: "sha256:child",
      edgeKind: "image-child",
    },
  ]);
});
