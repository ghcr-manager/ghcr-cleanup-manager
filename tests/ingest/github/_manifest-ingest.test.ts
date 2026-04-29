import assert from "node:assert/strict";
import test from "node:test";
import type { ScanWriter, SnapshotRepository } from "../../../src/db/index.js";
import { ingestManifests } from "../../../src/ingest/github/_manifest-ingest.js";

test("manifest ingest fetches manifests with shared token reuse", async () => {
  const scanId = 123;
  let tokenRequests = 0;
  let activeManifestRequests = 0;
  let maxManifestRequests = 0;
  const manifestDigests = ["sha256:index-1", "sha256:index-2", "sha256:index-3"];
  const fetchedManifestDigests: string[] = [];
  const insertedEdges: Array<{ parentDigest: string; childDigest: string; edgeKind: string }> = [];

  const writer = {
    insertManifest() {},
    insertManifestPayload() {},
    insertManifestDescriptor() {},
    insertManifestEdge(edge: { parentDigest: string; childDigest: string; edgeKind: string }) {
      insertedEdges.push(edge);
    },
    rebuildManifestReachability() {},
  } as unknown as ScanWriter;

  const repository = {
    listPackageVersionDigestsByScanId() {
      return [...manifestDigests];
    },
  } as unknown as SnapshotRepository;

  await ingestManifests(
    async (input) => {
      if (input.includes("/token?")) {
        tokenRequests += 1;
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          async json() {
            return { token: "registry-token", expires_in: 3600 };
          },
        };
      }

      if (input.includes("/manifests/")) {
        activeManifestRequests += 1;
        maxManifestRequests = Math.max(maxManifestRequests, activeManifestRequests);
        const digest = input.split("/").at(-1);
        assert.ok(digest);
        fetchedManifestDigests.push(digest);
        await new Promise((resolve) => setTimeout(resolve, 5));
        activeManifestRequests -= 1;
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/vnd.oci.image.manifest.v1+json" }),
          async json() {
            return { mediaType: "application/vnd.oci.image.manifest.v1+json" };
          },
        };
      }

      throw new Error(`unexpected request: ${input}`);
    },
    "https://ghcr.test",
    {
      owner: "acme",
      packageName: "example",
      token: "secret-token",
      logger: {
        debug() {},
        info() {},
        warn() {},
        error() {},
      },
    },
    writer,
    repository,
    scanId,
  );

  assert.equal(tokenRequests, 1);
  assert.deepEqual(fetchedManifestDigests.sort(), [...manifestDigests].sort());
  assert.ok(maxManifestRequests > 1);
  assert.equal(insertedEdges.length, 0);
});
