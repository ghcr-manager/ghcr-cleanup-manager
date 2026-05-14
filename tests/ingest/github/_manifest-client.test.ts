import assert from "node:assert/strict";
import test from "node:test";
import { loadManifestGraph } from "../../../src/ingest/github/_manifest-client.js";

test("manifest client maps child and referrer edges", async () => {
  const responses = new Map<string, unknown>([
    ["https://ghcr.test/token?service=ghcr.test&scope=repository%3Aacme%2Fexample%3Apull", { token: "registry-token" }],
    [
      "https://ghcr.test/v2/acme/example/manifests/sha256:index",
      {
        mediaType: "application/vnd.oci.image.index.v1+json",
        annotations: {
          "org.opencontainers.image.ref.name": "latest"
        },
        config: {
          mediaType: "application/vnd.oci.empty.v1+json"
        },
        manifests: [
          {
            digest: "sha256:child",
            mediaType: "application/vnd.oci.image.manifest.v1+json"
          }
        ],
        subject: {
          digest: "sha256:subject"
        }
      }
    ]
  ]);

  const manifest = await loadManifestGraph(
    async (input, init) => {
      const body = responses.get(input);
      assert.ok(body);
      if (input.includes("/manifests/")) {
        assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer registry-token");
      }

      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/vnd.oci.image.index.v1+json" }),
        async json() {
          return body;
        }
      };
    },
    "https://ghcr.test",
    "sha256:index",
    "registry-token",
    {
      owner: "acme",
      packageName: "example",
      token: "token",
      logger: { debug() {}, info() {}, warn() {}, error() {} }
    }
  );

  assert.equal(manifest.record.digest, "sha256:index");
  assert.deepEqual(manifest.record, {
    digest: "sha256:index",
    manifestKind: "image_index",
    mediaType: "application/vnd.oci.image.index.v1+json",
    artifactType: undefined,
    configMediaType: "application/vnd.oci.empty.v1+json",
    subjectDigest: "sha256:subject",
    annotations: {
      "org.opencontainers.image.ref.name": "latest"
    }
  });
  assert.match(manifest.rawJson, /"mediaType":"application\/vnd\.oci\.image\.index\.v1\+json"/);
  assert.deepEqual(manifest.descriptorRecords, [
    {
      parentDigest: "sha256:index",
      childDigest: "sha256:child",
      mediaType: "application/vnd.oci.image.manifest.v1+json",
      artifactType: undefined,
      platform: undefined
    }
  ]);
  assert.deepEqual(manifest.edgeRecords, [
    { parentDigest: "sha256:index", childDigest: "sha256:child", edgeKind: "image-child" },
    { parentDigest: "sha256:subject", childDigest: "sha256:index", edgeKind: "referrer" }
  ]);
});

test("manifest client surfaces fetch transport failures with digest context", async () => {
  await assert.rejects(
    () =>
      loadManifestGraph(
        async () => {
          throw new TypeError("fetch failed");
        },
        "https://ghcr.test",
        "sha256:index",
        "registry-token",
        {
          owner: "acme",
          packageName: "example",
          token: "token",
          logger: { debug() {}, info() {}, warn() {}, error() {} }
        }
      ),
    /GHCR manifest request for sha256:index failed - fetch failed/
  );
});
