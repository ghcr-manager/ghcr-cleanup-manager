import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { handleScan } from "../../src/cli/_scan-command.js";

test("handleScan requires an owner for GitHub scans", async () => {
  await assert.rejects(
    () => handleScan(["--db", "scan.sqlite", "--log-level", "silent", "--package", "example"]),
    /missing required option: --owner/
  );
});

test("handleScan imports a live scan and writes GitHub output", async () => {
  const tempDirectory = mkdtempSync(join(tmpdir(), "ghcr-cleanup-manager-"));
  const databasePath = join(tempDirectory, "scan.sqlite");
  const githubOutputPath = join(tempDirectory, "github-output.txt");
  const originalFetch = globalThis.fetch;
  const originalLog = console.log;
  const writes: string[] = [];
  console.log = (message?: unknown) => {
    writes.push(String(message));
  };

  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const responses = new Map<
      string,
      {
        body: unknown;
        contentType?: string;
      }
    >([
      [
        "https://api.github.com/users/acme",
        {
          body: {
            type: "Organization"
          }
        }
      ],
      [
        "https://api.github.com/orgs/acme/packages/container/example",
        {
          body: {
            visibility: "public"
          }
        }
      ],
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
            }
          ]
        }
      ],
      [
        "https://api.github.com/orgs/acme/packages/container/example/versions?per_page=100&page=2",
        {
          body: []
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
            manifests: []
          }
        }
      ]
    ]);

    const response = responses.get(url);
    if (!response) {
      throw new Error(`unexpected request: ${url}`);
    }

    if (url.includes("/manifests/")) {
      assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer registry-token");
    }

    return {
      ok: true,
      status: 200,
      headers: new Headers(response.contentType ? { "content-type": response.contentType } : {}),
      async json() {
        return response.body;
      }
    } as Response;
  }) as typeof fetch;

  try {
    assert.equal(
      await handleScan([
        "--db",
        databasePath,
        "--owner",
        "acme",
        "--package",
        "example",
        "--token",
        "test-token",
        "--github-output",
        githubOutputPath,
        "--log-level",
        "silent"
      ]),
      0
    );
  } finally {
    globalThis.fetch = originalFetch;
    console.log = originalLog;
  }

  const summary = JSON.parse(writes[0] as string) as {
    owner: string;
    packageName: string;
    scanCompletedAt: string;
    packageVersions: number;
    tags: number;
    manifests: number;
    manifestEdges: number;
  };
  assert.deepEqual(summary, {
    owner: "acme",
    packageName: "example",
    scanCompletedAt: summary.scanCompletedAt,
    packageVersions: 1,
    tags: 1,
    manifests: 1,
    manifestEdges: 0
  });
  assert.match(summary.scanCompletedAt, /^\d{4}-\d{2}-\d{2}T/);

  const githubOutput = readFileSync(githubOutputPath, "utf8");
  assert.match(githubOutput, /owner=acme/);
  assert.match(githubOutput, /package_name=example/);
  assert.match(githubOutput, /package_versions=1/);

  rmSync(tempDirectory, { recursive: true, force: true });
});
