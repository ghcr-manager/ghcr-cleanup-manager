import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { writeJsonOutput } from "../../src/cli/_json-output.js";

test("writeJsonOutput prints compact JSON when no output path is provided", () => {
  const originalLog = console.log;
  const writes: string[] = [];
  console.log = (message?: unknown) => {
    writes.push(String(message));
  };

  try {
    writeJsonOutput([], "--summary-json-path", { dryRun: true, tags: ["latest"] });
  } finally {
    console.log = originalLog;
  }

  assert.deepEqual(writes, ['{"dryRun":true,"tags":["latest"]}']);
});

test("writeJsonOutput writes JSON to a file when an output path is provided", () => {
  const tempDirectory = mkdtempSync(join(tmpdir(), "ghcr-cleanup-manager-"));
  const outputPath = join(tempDirectory, "summary.json");
  const originalLog = console.log;
  const writes: string[] = [];
  console.log = (message?: unknown) => {
    writes.push(String(message));
  };

  try {
    writeJsonOutput(["--summary-json-path", outputPath], "--summary-json-path", {
      dryRun: false,
      tags: ["latest"]
    });
  } finally {
    console.log = originalLog;
  }

  assert.deepEqual(writes, []);
  assert.equal(readFileSync(outputPath, "utf8"), '{"dryRun":false,"tags":["latest"]}\n');
  rmSync(tempDirectory, { recursive: true, force: true });
});
