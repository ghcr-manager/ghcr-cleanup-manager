import assert from "node:assert/strict";
import test from "node:test";
import {
  loadRegistryManifestByDigest,
  putRegistryManifestForTag
} from "../../src/execute/_registry-manifest-client.js";

test("loadRegistryManifestByDigest loads a manifest document", async () => {
  const manifest = await loadRegistryManifestByDigest(
    "acme",
    "example",
    "sha256:source",
    "registry-token",
    {
      debug() {},
      info() {},
      warn() {},
      error() {}
    },
    {
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/vnd.oci.image.manifest.v1+json" }),
        async json() {
          return {
            schemaVersion: 2,
            mediaType: "application/vnd.oci.image.manifest.v1+json",
            config: { mediaType: "application/vnd.oci.image.config.v1+json" },
            layers: []
          };
        }
      })
    }
  );

  assert.equal(manifest.digest, "sha256:source");
  assert.equal(manifest.mediaType, "application/vnd.oci.image.manifest.v1+json");
});

test("putRegistryManifestForTag returns the local content digest", async () => {
  const digest = await putRegistryManifestForTag(
    "acme",
    "example",
    "latest",
    "application/vnd.oci.image.manifest.v1+json",
    '{"schemaVersion":2}\n',
    "registry-token",
    {
      debug() {},
      info() {},
      warn() {},
      error() {}
    },
    {
      fetchImpl: async () => ({
        ok: true,
        status: 201,
        headers: new Headers(),
        async json() {
          return {};
        }
      })
    }
  );

  assert.match(digest, /^sha256:[a-f0-9]{64}$/);
});

test("loadRegistryManifestByDigest falls back to response content type for media type", async () => {
  const manifest = await loadRegistryManifestByDigest(
    "acme",
    "example",
    "sha256:source",
    "registry-token",
    {
      debug() {},
      info() {},
      warn() {},
      error() {}
    },
    {
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/vnd.oci.artifact.manifest.v1+json" }),
        async json() {
          return { schemaVersion: 2 };
        }
      })
    }
  );

  assert.equal(manifest.mediaType, "application/vnd.oci.artifact.manifest.v1+json");
});

test("loadRegistryManifestByDigest rejects responses without any media type", async () => {
  await assert.rejects(
    () =>
      loadRegistryManifestByDigest(
        "acme",
        "example",
        "sha256:source",
        "registry-token",
        {
          debug() {},
          info() {},
          warn() {},
          error() {}
        },
        {
          fetchImpl: async () => ({
            ok: true,
            status: 200,
            headers: new Headers(),
            async json() {
              return { schemaVersion: 2 };
            }
          })
        }
      ),
    /manifest response for sha256:source did not include a media type/
  );
});

test("loadRegistryManifestByDigest surfaces non-retryable HTTP failures", async () => {
  await assert.rejects(
    () =>
      loadRegistryManifestByDigest(
        "acme",
        "example",
        "sha256:source",
        "registry-token",
        {
          debug() {},
          info() {},
          warn() {},
          error() {}
        },
        {
          fetchImpl: async () => ({
            ok: false,
            status: 404,
            headers: new Headers({ "content-type": "application/json" }),
            async json() {
              return { message: "manifest unknown" };
            }
          })
        }
      ),
    /GHCR manifest request for sha256:source failed - status 404 - manifest unknown/
  );
});

test("putRegistryManifestForTag surfaces transport failures", async () => {
  await assert.rejects(
    () =>
      putRegistryManifestForTag(
        "acme",
        "example",
        "latest",
        "application/vnd.oci.image.manifest.v1+json",
        '{"schemaVersion":2}\n',
        "registry-token",
        {
          debug() {},
          info() {},
          warn() {},
          error() {}
        },
        {
          fetchImpl: async () => {
            throw new TypeError("fetch failed", {
              cause: Object.assign(new Error("socket hang up"), { code: "ECONNRESET" })
            });
          }
        }
      ),
    /GHCR manifest put request for tag latest failed - fetch failed/
  );
});

test("loadRegistryManifestByDigest sends the accepted media types and retries retryable failures", async () => {
  const originalSetTimeout = globalThis.setTimeout;
  const warnings: string[] = [];
  let attempts = 0;
  const requests: Array<{ url: string; accept: string | null }> = [];
  globalThis.setTimeout = ((callback: (...args: unknown[]) => void) => {
    callback();
    return 0;
  }) as unknown as typeof setTimeout;

  try {
    const manifest = await loadRegistryManifestByDigest(
      "acme",
      "example",
      "sha256:source",
      "registry-token",
      {
        debug() {},
        info() {},
        warn(message) {
          warnings.push(message);
        },
        error() {}
      },
      {
        fetchImpl: async (input, init) => {
          attempts += 1;
          const headers = new Headers(init?.headers);
          requests.push({ url: String(input), accept: headers.get("accept") });
          if (attempts === 1) {
            return {
              ok: false,
              status: 503,
              headers: new Headers({ "content-type": "application/json" }),
              async json() {
                return { message: "Service Unavailable" };
              }
            };
          }
          return {
            ok: true,
            status: 200,
            headers: new Headers({ "content-type": "application/vnd.oci.image.index.v1+json" }),
            async json() {
              return {
                schemaVersion: 2,
                mediaType: "application/vnd.oci.image.index.v1+json",
                manifests: []
              };
            }
          };
        }
      }
    );

    assert.equal(manifest.mediaType, "application/vnd.oci.image.index.v1+json");
    assert.equal(attempts, 2);
    assert.equal(requests[0]?.url, "https://ghcr.io/v2/acme/example/manifests/sha256:source");
    assert.match(requests[0]?.accept ?? "", /application\/vnd\.docker\.distribution\.manifest\.list\.v2\+json/);
    assert.match(
      warnings[0] ?? "",
      /GHCR manifest request for sha256:source failed on attempt 1\/4; retrying in 1000ms - GHCR manifest request for sha256:source failed - status 503 - Service Unavailable/
    );
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }
});

test("putRegistryManifestForTag sends the expected headers and surfaces non-retryable HTTP failures", async () => {
  const requests: Array<{ url: string; method?: string; contentType: string | null; authorization: string | null }> =
    [];

  await assert.rejects(
    () =>
      putRegistryManifestForTag(
        "acme",
        "example",
        "latest",
        "application/vnd.oci.image.manifest.v1+json",
        '{"schemaVersion":2}\n',
        "registry-token",
        {
          debug() {},
          info() {},
          warn() {},
          error() {}
        },
        {
          fetchImpl: async (input, init) => {
            const headers = new Headers(init?.headers);
            requests.push({
              url: String(input),
              method: init?.method,
              contentType: headers.get("content-type"),
              authorization: headers.get("authorization")
            });
            return {
              ok: false,
              status: 400,
              headers: new Headers({ "content-type": "application/json" }),
              async json() {
                return { message: "bad manifest" };
              }
            };
          }
        }
      ),
    /GHCR manifest put request for tag latest failed - status 400 - bad manifest/
  );

  assert.deepEqual(requests, [
    {
      url: "https://ghcr.io/v2/acme/example/manifests/latest",
      method: "PUT",
      contentType: "application/vnd.oci.image.manifest.v1+json",
      authorization: "Bearer registry-token"
    }
  ]);
});
