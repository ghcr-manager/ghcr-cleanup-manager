import type Database from "better-sqlite3";

const _schemaStatements = [
  `PRAGMA foreign_keys = ON`,
  `
    CREATE TABLE IF NOT EXISTS package_scans (
      scan_id INTEGER PRIMARY KEY,
      scan_uuid TEXT NOT NULL UNIQUE,
      package_name TEXT NOT NULL,
      scan_started_at TEXT NOT NULL,
      scan_completed_at TEXT,
      status TEXT NOT NULL,
      CHECK(status IN ('running', 'completed', 'failed'))
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS package_versions (
      scan_id INTEGER NOT NULL,
      version_id INTEGER NOT NULL,
      digest TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(scan_id, version_id),
      UNIQUE(scan_id, version_id, digest),
      FOREIGN KEY(scan_id) REFERENCES package_scans(scan_id)
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS package_version_payloads (
      scan_id INTEGER NOT NULL,
      version_id INTEGER NOT NULL,
      raw_json TEXT NOT NULL,
      PRIMARY KEY(scan_id, version_id),
      FOREIGN KEY(scan_id, version_id) REFERENCES package_versions(scan_id, version_id)
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS tags (
      scan_id INTEGER NOT NULL,
      tag TEXT NOT NULL,
      digest TEXT NOT NULL,
      version_id INTEGER NOT NULL,
      PRIMARY KEY(scan_id, tag),
      FOREIGN KEY(scan_id, version_id, digest) REFERENCES package_versions(scan_id, version_id, digest)
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS manifests (
      scan_id INTEGER NOT NULL,
      digest TEXT NOT NULL,
      media_type TEXT NOT NULL,
      artifact_type TEXT,
      config_media_type TEXT,
      subject_digest TEXT,
      annotations_json TEXT,
      platform_os TEXT,
      platform_architecture TEXT,
      platform_variant TEXT,
      PRIMARY KEY(scan_id, digest),
      FOREIGN KEY(scan_id) REFERENCES package_scans(scan_id)
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS manifest_descriptors (
      scan_id INTEGER NOT NULL,
      parent_digest TEXT NOT NULL,
      child_digest TEXT NOT NULL,
      media_type TEXT NOT NULL,
      artifact_type TEXT,
      platform_os TEXT,
      platform_architecture TEXT,
      platform_variant TEXT,
      PRIMARY KEY(scan_id, parent_digest, child_digest),
      FOREIGN KEY(scan_id, parent_digest) REFERENCES manifests(scan_id, digest)
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS manifest_payloads (
      scan_id INTEGER NOT NULL,
      digest TEXT NOT NULL,
      raw_json TEXT NOT NULL,
      PRIMARY KEY(scan_id, digest),
      FOREIGN KEY(scan_id, digest) REFERENCES manifests(scan_id, digest)
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS manifest_edges (
      scan_id INTEGER NOT NULL,
      parent_digest TEXT NOT NULL,
      child_digest TEXT NOT NULL,
      edge_kind TEXT NOT NULL,
      PRIMARY KEY(scan_id, parent_digest, child_digest, edge_kind),
      FOREIGN KEY(scan_id, parent_digest) REFERENCES manifests(scan_id, digest),
      FOREIGN KEY(scan_id, child_digest) REFERENCES manifests(scan_id, digest)
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS manifest_reachability (
      scan_id INTEGER NOT NULL,
      ancestor_digest TEXT NOT NULL,
      descendant_digest TEXT NOT NULL,
      min_distance INTEGER NOT NULL,
      PRIMARY KEY(scan_id, ancestor_digest, descendant_digest),
      FOREIGN KEY(scan_id, ancestor_digest) REFERENCES manifests(scan_id, digest),
      FOREIGN KEY(scan_id, descendant_digest) REFERENCES manifests(scan_id, digest),
      CHECK(min_distance >= 0)
    )
  `,
  `CREATE INDEX IF NOT EXISTS idx_package_versions_scan_created_at ON package_versions(scan_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_package_versions_scan_digest ON package_versions(scan_id, digest)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_package_scans_scan_uuid ON package_scans(scan_uuid)`,
  `CREATE INDEX IF NOT EXISTS idx_package_scans_name_started_at ON package_scans(package_name, scan_started_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_tags_scan_digest ON tags(scan_id, digest)`,
  `CREATE INDEX IF NOT EXISTS idx_manifest_descriptors_scan_child ON manifest_descriptors(scan_id, child_digest)`,
  `CREATE INDEX IF NOT EXISTS idx_manifest_edges_scan_parent ON manifest_edges(scan_id, parent_digest)`,
  `CREATE INDEX IF NOT EXISTS idx_manifest_edges_scan_child ON manifest_edges(scan_id, child_digest)`,
  `CREATE INDEX IF NOT EXISTS idx_manifest_reachability_scan_descendant ON manifest_reachability(scan_id, descendant_digest)`
];

export function initializeSchema(database: Database.Database): void {
  for (const statement of _schemaStatements) {
    database.exec(statement);
  }

  _ensurePackageScanUuidColumn(database);
}

function _ensurePackageScanUuidColumn(database: Database.Database): void {
  const hasScanUuid = (
    database.prepare("SELECT name FROM pragma_table_info('package_scans') WHERE name = 'scan_uuid' LIMIT 1").get() as
      | { name: string }
      | undefined
  ) !== undefined;

  if (!hasScanUuid) {
    database.exec("ALTER TABLE package_scans ADD COLUMN scan_uuid TEXT");
  }

  database.exec(`
    UPDATE package_scans
    SET scan_uuid = (
      lower(hex(randomblob(4))) || '-' ||
      lower(hex(randomblob(2))) || '-' ||
      lower(hex(randomblob(2))) || '-' ||
      lower(hex(randomblob(2))) || '-' ||
      lower(hex(randomblob(6)))
    )
    WHERE scan_uuid IS NULL OR scan_uuid = ''
  `);
}
