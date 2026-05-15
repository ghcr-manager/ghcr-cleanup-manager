import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { handleExecute } from "../../src/cli/_execute-command.js";
import { openDatabase, ScanWriter } from "../../src/db/index.js";
import { importFileScan } from "../helpers/index.js";

test("handleExecute requires a token", async () => {
  await assert.rejects(
    () => handleExecute(["--db", "scan.sqlite", "--owner", "acme", "--package", "example", "--delete-untagged"]),
    /missing required option: --token/
  );
});

test("handleExecute deletes fully deletable roots and prints a summary", async () => {
  const tempDirectory = mkdtempSync(join(tmpdir(), "ghcr-manager-"));
  const databasePath = join(tempDirectory, "scan.sqlite");
  const database = openDatabase(databasePath);
  const writer = new ScanWriter(database);
  await importFileScan("tests/fixtures/sample-package.json", writer);
  database.close();

  const fetchCalls: Array<{ url: string; method?: string }> = [];
  const originalFetch = globalThis.fetch;
  const originalLog = console.log;
  const writes: string[] = [];
  globalThis.fetch = async (input, init) => {
    fetchCalls.push({ url: String(input), method: init?.method });
    return {
      ok: true,
      status: 204,
      headers: new Headers(),
      async json() {
        return {};
      }
    } as Response;
  };
  console.log = (message?: unknown) => {
    writes.push(String(message));
  };

  try {
    assert.equal(
      await handleExecute([
        "--db",
        databasePath,
        "--owner",
        "acme",
        "--package",
        "example",
        "--token",
        "token",
        "--delete-untagged"
      ]),
      0
    );
  } finally {
    globalThis.fetch = originalFetch;
    console.log = originalLog;
    rmSync(tempDirectory, { recursive: true, force: true });
  }

  assert.deepEqual(fetchCalls, [
    {
      url: "https://api.github.com/orgs/acme/packages/container/example/versions/104",
      method: "DELETE"
    }
  ]);
  const summary = JSON.parse(writes[0] as string) as {
    deletedPackageVersions: Array<{ versionId: number; digest: string }>;
    untaggedTags: Array<unknown>;
    unsupportedUntagRoots: Array<unknown>;
  };
  assert.deepEqual(summary.deletedPackageVersions, [{ versionId: 104, digest: "sha256:untagged-old" }]);
  assert.deepEqual(summary.untaggedTags, []);
  assert.deepEqual(summary.unsupportedUntagRoots, []);
});

test("handleExecute applies untag-only roots via a temporary manifest clone", async () => {
  const tempDirectory = mkdtempSync(join(tmpdir(), "ghcr-manager-"));
  const databasePath = join(tempDirectory, "scan.sqlite");
  const database = openDatabase(databasePath);
  const writer = new ScanWriter(database);
  writer.resetScan("acme", "example", "2026-05-15T00:00:00.000Z");
  writer.insertPackageVersion({
    versionId: 101,
    createdAt: "2026-05-10T00:00:00.000Z",
    updatedAt: "2026-05-10T00:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 101,
    digest: "sha256:index-shared",
    manifestKind: "image_manifest",
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });
  writer.insertTag({
    tag: "latest",
    versionId: 101
  });
  writer.insertTag({
    tag: "keep-me",
    versionId: 101
  });
  writer.markScanCompleted("2026-05-15T00:00:00.000Z");
  database.close();

  const originalFetch = globalThis.fetch;
  const originalLog = console.log;
  const writes: string[] = [];
  let detachedDigest = "sha256:detached";
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith("https://ghcr.io/token")) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        async json() {
          return { token: "registry-token" };
        }
      } as Response;
    }
    if (url === "https://ghcr.io/v2/acme/example/manifests/sha256:index-shared") {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/vnd.oci.image.manifest.v1+json" }),
        async json() {
          return {
            schemaVersion: 2,
            mediaType: "application/vnd.oci.image.manifest.v1+json",
            config: { mediaType: "application/vnd.oci.image.config.v1+json", digest: "sha256:config", size: 1 },
            layers: []
          };
        }
      } as Response;
    }
    if (url === "https://ghcr.io/v2/acme/example/manifests/latest") {
      const crypto = await import("node:crypto");
      detachedDigest = `sha256:${crypto
        .createHash("sha256")
        .update(String(init?.body ?? ""))
        .digest("hex")}`;
      return {
        ok: true,
        status: 201,
        headers: new Headers(),
        async json() {
          return {};
        }
      } as Response;
    }
    if (url === "https://api.github.com/orgs/acme/packages/container/example/versions?per_page=100&page=1") {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        async json() {
          return [
            {
              id: 202,
              name: detachedDigest,
              metadata: {
                container: {
                  tags: ["latest"]
                }
              }
            }
          ];
        }
      } as Response;
    }
    if (url === "https://api.github.com/orgs/acme/packages/container/example/versions/202") {
      return {
        ok: true,
        status: 204,
        headers: new Headers(),
        async json() {
          return {};
        }
      } as Response;
    }

    throw new Error(`unexpected fetch: ${url}`);
  };
  console.log = (message?: unknown) => {
    writes.push(String(message));
  };

  try {
    assert.equal(
      await handleExecute([
        "--db",
        databasePath,
        "--owner",
        "acme",
        "--package",
        "example",
        "--token",
        "token",
        "--delete-tag",
        "latest"
      ]),
      0
    );
  } finally {
    globalThis.fetch = originalFetch;
    console.log = originalLog;
    rmSync(tempDirectory, { recursive: true, force: true });
  }

  const summary = JSON.parse(writes[0] as string) as {
    deletedPackageVersions: Array<unknown>;
    untaggedTags: Array<{
      tag: string;
      sourceDigest: string;
      detachedVersionId: number;
      detachedDigest: string;
      sourceVersionId: number;
    }>;
  };
  assert.deepEqual(summary.deletedPackageVersions, []);
  assert.deepEqual(summary.untaggedTags, [
    {
      tag: "latest",
      sourceDigest: "sha256:index-shared",
      detachedVersionId: 202,
      detachedDigest: summary.untaggedTags[0]?.detachedDigest,
      sourceVersionId: 101
    }
  ]);
});

test("handleExecute treats unmatched regex delete-tag selectors as a no-op", async () => {
  const tempDirectory = mkdtempSync(join(tmpdir(), "ghcr-manager-"));
  const databasePath = join(tempDirectory, "scan.sqlite");
  const database = openDatabase(databasePath);
  const writer = new ScanWriter(database);
  await importFileScan("tests/fixtures/sample-package.json", writer);
  database.close();

  const fetchCalls: Array<{ url: string; method?: string }> = [];
  const originalFetch = globalThis.fetch;
  const originalLog = console.log;
  const writes: string[] = [];
  globalThis.fetch = async (input, init) => {
    fetchCalls.push({ url: String(input), method: init?.method });
    throw new Error(`unexpected fetch: ${String(input)}`);
  };
  console.log = (message?: unknown) => {
    writes.push(String(message));
  };

  try {
    assert.equal(
      await handleExecute([
        "--db",
        databasePath,
        "--owner",
        "acme",
        "--package",
        "example",
        "--token",
        "token",
        "--delete-tag",
        "^does-not-match$",
        "--use-regex"
      ]),
      0
    );
  } finally {
    globalThis.fetch = originalFetch;
    console.log = originalLog;
    rmSync(tempDirectory, { recursive: true, force: true });
  }

  assert.deepEqual(fetchCalls, []);
  const summary = JSON.parse(writes[0] as string) as {
    deletedPackageVersions: Array<unknown>;
    untaggedTags: Array<unknown>;
    blockedRoots: Array<unknown>;
  };
  assert.deepEqual(summary.deletedPackageVersions, []);
  assert.deepEqual(summary.untaggedTags, []);
  assert.deepEqual(summary.blockedRoots, []);
});
