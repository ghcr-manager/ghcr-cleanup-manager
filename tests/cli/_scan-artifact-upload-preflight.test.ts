import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openDatabase, ScanWriter, SnapshotRepository } from "../../src/db/index.js";
import { runScanArtifactUploadPreflight } from "../../src/cli/_scan-artifact-upload-preflight.js";
import { importFileScan } from "../helpers/index.js";

const _PASSPHRASE_ENV = "GHCR_MANAGER_DB_ARTIFACT_ENCRYPTION_PASSPHRASE";

test("artifact upload preflight fails immediately for an existing non-public scan without fetch", async () => {
  const tempDirectory = mkdtempSync(join(tmpdir(), "ghcr-manager-"));
  const databasePath = join(tempDirectory, "scan.sqlite");
  const previousPassphrase = process.env[_PASSPHRASE_ENV];
  process.env[_PASSPHRASE_ENV] = "";

  try {
    const database = openDatabase(databasePath);
    const writer = new ScanWriter(database);
    const repository = new SnapshotRepository(database);
    await importFileScan("tests/fixtures/sample-package.json", writer);

    let fetchCalls = 0;
    await assert.rejects(
      () =>
        runScanArtifactUploadPreflight(
          repository,
          {
            owner: "acme",
            packageName: "example",
            token: "token",
            logger: _createLogger(),
            uploadIntended: true
          },
          async () => {
            fetchCalls += 1;
            throw new Error("unexpected fetch");
          }
        ),
      /Refusing to upload DB artifact for a non-public registry without encryption/
    );
    assert.equal(fetchCalls, 0);

    database.close();
  } finally {
    _restoreEnv(_PASSPHRASE_ENV, previousPassphrase);
    rmSync(tempDirectory, { recursive: true, force: true });
  }
});

test("artifact upload preflight fails when an older completed scan was non-public even if the latest one was public", async () => {
  const tempDirectory = mkdtempSync(join(tmpdir(), "ghcr-manager-"));
  const databasePath = join(tempDirectory, "scan.sqlite");
  const previousPassphrase = process.env[_PASSPHRASE_ENV];
  process.env[_PASSPHRASE_ENV] = "";

  try {
    const database = openDatabase(databasePath);
    const writer = new ScanWriter(database);
    const repository = new SnapshotRepository(database);
    await importFileScan("tests/fixtures/sample-package.json", writer);
    writer.resetScan("acme", "example", "2026-05-17T00:00:00.000Z");
    writer.setPackageIsPublic(true);
    writer.markScanCompleted("2026-05-17T00:00:00.000Z");

    let fetchCalls = 0;
    await assert.rejects(
      () =>
        runScanArtifactUploadPreflight(
          repository,
          {
            owner: "acme",
            packageName: "example",
            token: "token",
            logger: _createLogger(),
            uploadIntended: true
          },
          async () => {
            fetchCalls += 1;
            throw new Error("unexpected fetch");
          }
        ),
      /Refusing to upload DB artifact for a non-public registry without encryption/
    );
    assert.equal(fetchCalls, 0);

    database.close();
  } finally {
    _restoreEnv(_PASSPHRASE_ENV, previousPassphrase);
    rmSync(tempDirectory, { recursive: true, force: true });
  }
});

test("artifact upload preflight checks remote package visibility when no prior scan exists", async () => {
  const tempDirectory = mkdtempSync(join(tmpdir(), "ghcr-manager-"));
  const databasePath = join(tempDirectory, "scan.sqlite");
  const previousPassphrase = process.env[_PASSPHRASE_ENV];
  process.env[_PASSPHRASE_ENV] = "";

  try {
    const database = openDatabase(databasePath);
    const repository = new SnapshotRepository(database);

    let requestedUrl = "";
    const result = await runScanArtifactUploadPreflight(
      repository,
      {
        owner: "acme",
        packageName: "example",
        token: "token",
        logger: _createLogger(),
        uploadIntended: true
      },
      async (input) => {
        requestedUrl = String(input);
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          async json() {
            return { visibility: "public" };
          }
        };
      }
    );

    assert.equal(requestedUrl, "https://api.github.com/orgs/acme/packages/container/example");
    assert.deepEqual(result, { isPublic: true });
    database.close();
  } finally {
    _restoreEnv(_PASSPHRASE_ENV, previousPassphrase);
    rmSync(tempDirectory, { recursive: true, force: true });
  }
});

test("artifact upload preflight skips remote visibility checks when a passphrase is present", async () => {
  const tempDirectory = mkdtempSync(join(tmpdir(), "ghcr-manager-"));
  const databasePath = join(tempDirectory, "scan.sqlite");
  const previousPassphrase = process.env[_PASSPHRASE_ENV];
  process.env[_PASSPHRASE_ENV] = "test-passphrase";

  try {
    const database = openDatabase(databasePath);
    const repository = new SnapshotRepository(database);

    let fetchCalls = 0;
    const result = await runScanArtifactUploadPreflight(
      repository,
      {
        owner: "acme",
        packageName: "example",
        token: "token",
        logger: _createLogger(),
        uploadIntended: true
      },
      async () => {
        fetchCalls += 1;
        throw new Error("unexpected fetch");
      }
    );

    assert.deepEqual(result, {});
    assert.equal(fetchCalls, 0);
    database.close();
  } finally {
    _restoreEnv(_PASSPHRASE_ENV, previousPassphrase);
    rmSync(tempDirectory, { recursive: true, force: true });
  }
});

function _createLogger() {
  return {
    debug() {},
    info() {},
    warn() {},
    error() {}
  };
}

function _restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}
