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

test("initializeSchema stores package publicness as a non-null boolean-like integer", () => {
  const database = new Database(":memory:");
  initializeSchema(database);

  const row = database
    .prepare(
      `
        SELECT sql
        FROM sqlite_master
        WHERE type = 'table' AND name = 'package_scans'
      `
    )
    .get() as { sql?: string } | undefined;

  assert.match(row?.sql ?? "", /is_public INTEGER NOT NULL DEFAULT 0/);
  assert.match(row?.sql ?? "", /CHECK\(is_public IN \(0, 1\)\)/);

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

test("initializeSchema creates descendant reachability indexes for root lookups", () => {
  const database = new Database(":memory:");
  initializeSchema(database);

  const indexes = database.prepare("PRAGMA index_list(manifest_reachability)").all() as Array<{
    name: string;
  }>;

  assert.ok(indexes.some((index) => index.name === "idx_manifest_reachability_scan_descendant"));
  assert.ok(indexes.some((index) => index.name === "idx_manifest_reachability_scan_descendant_distance"));

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

  const digestDerivedTagRelationsRow = database
    .prepare(
      `
        SELECT sql
        FROM sqlite_master
        WHERE type = 'view' AND name = 'v_digest_derived_tag_relations'
      `
    )
    .get() as { sql?: string } | undefined;

  assert.match(digestDerivedTagRelationsRow?.sql ?? "", /CREATE VIEW v_digest_derived_tag_relations AS/);
  assert.match(digestDerivedTagRelationsRow?.sql ?? "", /SUBSTR\(t\.tag, 8, 64\)/);

  const cleanupRootClosureMembersRow = database
    .prepare(
      `
        SELECT sql
        FROM sqlite_master
        WHERE type = 'view' AND name = 'v_cleanup_root_closure_members'
      `
    )
    .get() as { sql?: string } | undefined;
  assert.match(cleanupRootClosureMembersRow?.sql ?? "", /CREATE VIEW v_cleanup_root_closure_members AS/);
  assert.match(cleanupRootClosureMembersRow?.sql ?? "", /validation_reason_code/);

  const cleanupBlockingOverlapsRow = database
    .prepare(
      `
        SELECT sql
        FROM sqlite_master
        WHERE type = 'view' AND name = 'v_cleanup_blocking_overlaps'
      `
    )
    .get() as { sql?: string } | undefined;
  assert.match(cleanupBlockingOverlapsRow?.sql ?? "", /CREATE VIEW v_cleanup_blocking_overlaps AS/);
  assert.match(cleanupBlockingOverlapsRow?.sql ?? "", /block_reason_code/);

  database.close();
});

test("initializeSchema creates v_scan_root_manifests with distance-based ancestor detection", () => {
  const database = new Database(":memory:");
  initializeSchema(database);

  const row = database
    .prepare(
      `
        SELECT sql
        FROM sqlite_master
        WHERE type = 'view' AND name = 'v_scan_root_manifests'
      `
    )
    .get() as { sql?: string } | undefined;

  assert.match(row?.sql ?? "", /mr\.descendant_digest = m\.digest/);
  assert.match(row?.sql ?? "", /mr\.min_distance > 0/);
  assert.doesNotMatch(row?.sql ?? "", /mr\.ancestor_digest <> m\.digest/);

  database.close();
});

test("initializeSchema creates cleanup audit tables", () => {
  const database = new Database(":memory:");
  initializeSchema(database);

  const cleanupRunsRow = database
    .prepare(
      `
        SELECT sql
        FROM sqlite_master
        WHERE type = 'table' AND name = 'cleanup_runs'
      `
    )
    .get() as { sql?: string } | undefined;
  assert.match(cleanupRunsRow?.sql ?? "", /dry_run INTEGER NOT NULL/);
  assert.match(cleanupRunsRow?.sql ?? "", /planner_inputs_json TEXT NOT NULL/);
  assert.match(cleanupRunsRow?.sql ?? "", /UNIQUE\(cleanup_run_id, scan_id\)/);

  const cleanupRootDecisionsRow = database
    .prepare(
      `
        SELECT sql
        FROM sqlite_master
        WHERE type = 'table' AND name = 'cleanup_root_decisions'
      `
    )
    .get() as { sql?: string } | undefined;
  assert.match(cleanupRootDecisionsRow?.sql ?? "", /validation_status TEXT NOT NULL/);
  assert.match(cleanupRootDecisionsRow?.sql ?? "", /validation_reason_code TEXT NOT NULL/);
  assert.match(cleanupRootDecisionsRow?.sql ?? "", /CHECK\(validation_status IN/);
  assert.doesNotMatch(cleanupRootDecisionsRow?.sql ?? "", /manifest_kind/);
  assert.match(cleanupRootDecisionsRow?.sql ?? "", /digest TEXT NOT NULL/);
  assert.match(cleanupRootDecisionsRow?.sql ?? "", /blocking_digest TEXT/);

  const cleanupProtectedRootsRow = database
    .prepare(
      `
        SELECT sql
        FROM sqlite_master
        WHERE type = 'table' AND name = 'cleanup_protected_roots'
      `
    )
    .get() as { sql?: string } | undefined;
  assert.equal(cleanupProtectedRootsRow, undefined);

  const cleanupProtectedRootBlocksRow = database
    .prepare(
      `
        SELECT sql
        FROM sqlite_master
        WHERE type = 'table' AND name = 'cleanup_protected_root_blocks'
      `
    )
    .get() as { sql?: string } | undefined;
  assert.match(cleanupProtectedRootBlocksRow?.sql ?? "", /scan_id INTEGER NOT NULL/);
  assert.match(cleanupProtectedRootBlocksRow?.sql ?? "", /protected_digest TEXT NOT NULL/);
  assert.match(cleanupProtectedRootBlocksRow?.sql ?? "", /blocked_digest TEXT NOT NULL/);
  assert.match(cleanupProtectedRootBlocksRow?.sql ?? "", /block_reason_code TEXT NOT NULL/);
  assert.match(cleanupProtectedRootBlocksRow?.sql ?? "", /overlap_digest TEXT NOT NULL/);

  database.close();
});
