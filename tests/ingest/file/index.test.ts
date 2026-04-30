import assert from "node:assert/strict";
import test from "node:test";
import { openDatabase, ScanWriter, SnapshotRepository } from "../../../src/db/index.js";
import { importFileScan } from "../../helpers/index.js";

test("file ingest writes fixture data directly into SQLite", async () => {
  const database = openDatabase(":memory:");
  const writer = new ScanWriter(database);
  const repository = new SnapshotRepository(database);

  await importFileScan("tests/fixtures/sample-package.json", writer);
  const scanId = writer.getActiveScanId();

  const metadata = repository.getPackageMetadata(scanId);
  assert.equal(metadata.owner, "acme");
  assert.equal(metadata.packageName, "example");
  assert.equal(repository.countPackageVersions(scanId), 5);
  assert.equal(repository.countManifestEdges(scanId), 2);
  assert.equal(
    (database.prepare("SELECT COUNT(*) AS total FROM manifest_reachability").get() as { total: number }).total,
    7
  );

  database.close();
});
