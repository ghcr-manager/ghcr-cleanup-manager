import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { writeGitHubScanOutputs } from "../../src/cli/_github-output.js";

test("writeGitHubScanOutputs writes GitHub output lines for scan summary fields", () => {
  const tempDirectory = mkdtempSync(join(tmpdir(), "ghcr-cleanup-manager-"));
  const outputPath = join(tempDirectory, "github-output.txt");

  try {
    writeGitHubScanOutputs(outputPath, {
      owner: "acme",
      packageName: "example",
      scanCompletedAt: "2026-05-15T12:00:00.000Z",
      packageVersions: 3,
      tags: 2,
      manifests: 4,
      manifestEdges: 5
    });

    assert.equal(
      readFileSync(outputPath, "utf8"),
      [
        "owner=acme",
        "package_name=example",
        "scan_completed_at=2026-05-15T12:00:00.000Z",
        "package_versions=3",
        "tags=2",
        "manifests=4",
        "manifest_edges=5",
        ""
      ].join("\n")
    );
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
});
