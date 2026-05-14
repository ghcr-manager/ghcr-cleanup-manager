import assert from "node:assert/strict";
import Database from "better-sqlite3";
import test from "node:test";
import { initializeSchema } from "../../src/db/_schema.js";

test("initializeSchema is idempotent", () => {
  const database = new Database(":memory:");
  initializeSchema(database);
  assert.doesNotThrow(() => initializeSchema(database));

  database.close();
});

test("initializeSchema creates manifest_reachability for precomputed graph reads", () => {
  const database = new Database(":memory:");
  initializeSchema(database);

  const row = database
    .prepare(
      `
        SELECT sql
        FROM sqlite_master
        WHERE type = 'table' AND name = 'manifest_reachability'
      `
    )
    .get() as { sql?: string } | undefined;

  assert.match(row?.sql ?? "", /ancestor_digest TEXT NOT NULL/);
  assert.match(row?.sql ?? "", /descendant_digest TEXT NOT NULL/);
  assert.match(row?.sql ?? "", /min_distance INTEGER NOT NULL/);

  database.close();
});

test("initializeSchema stores manifests with an optional checked manifest kind", () => {
  const database = new Database(":memory:");
  initializeSchema(database);

  const row = database
    .prepare(
      `
        SELECT sql
        FROM sqlite_master
        WHERE type = 'table' AND name = 'manifests'
      `
    )
    .get() as { sql?: string } | undefined;

  assert.match(row?.sql ?? "", /manifest_kind TEXT/);
  assert.doesNotMatch(row?.sql ?? "", /manifest_kind TEXT NOT NULL/);
  assert.match(row?.sql ?? "", /CHECK\(manifest_kind IN/);

  database.close();
});

test("initializeSchema links manifests to package versions and uniquely stores digests", () => {
  const database = new Database(":memory:");
  initializeSchema(database);

  const manifestForeignKeys = database.prepare("PRAGMA foreign_key_list(manifests)").all() as Array<{
    table: string;
    from: string;
    to: string;
  }>;
  assert.ok(
    manifestForeignKeys.some(
      (foreignKey) =>
        foreignKey.table === "package_versions" && foreignKey.from === "version_id" && foreignKey.to === "version_id"
    )
  );

  const manifestIndexes = database.prepare("PRAGMA index_list(manifests)").all() as Array<{
    name: string;
    unique: number;
  }>;
  assert.ok(manifestIndexes.some((index) => index.unique === 1));

  database.close();
});

test("initializeSchema creates SQL views from sql/views", () => {
  const database = new Database(":memory:");
  initializeSchema(database);

  const row = database
    .prepare(
      `
        SELECT sql
        FROM sqlite_master
        WHERE type = 'view' AND name = 'v_missing_digests_related_manifests'
      `
    )
    .get() as { sql?: string } | undefined;

  assert.match(row?.sql ?? "", /CREATE VIEW v_missing_digests_related_manifests AS/);

  database.close();
});
