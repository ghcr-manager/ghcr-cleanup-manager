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
      `,
    )
    .get() as { sql?: string } | undefined;

  assert.match(row?.sql ?? "", /ancestor_digest TEXT NOT NULL/);
  assert.match(row?.sql ?? "", /descendant_digest TEXT NOT NULL/);
  assert.match(row?.sql ?? "", /min_distance INTEGER NOT NULL/);

  database.close();
});
