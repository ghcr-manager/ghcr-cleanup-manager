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
        manifests: [
          {
            digest: "sha256:child",
            mediaType: "application/vnd.oci.image.manifest.v1+json",
          },
        ],
        subject: {
          digest: "sha256:subject",
        },
      },
    ],
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
        },
      };
    },
    "https://ghcr.test",
    "sha256:index",
    { owner: "acme", packageName: "example", token: "token" },
  );

  assert.equal(manifest.record.digest, "sha256:index");
  assert.deepEqual(manifest.edgeRecords, [
    { parentDigest: "sha256:index", childDigest: "sha256:child", edgeKind: "image-child" },
    { parentDigest: "sha256:subject", childDigest: "sha256:index", edgeKind: "referrer" },
  ]);
});
