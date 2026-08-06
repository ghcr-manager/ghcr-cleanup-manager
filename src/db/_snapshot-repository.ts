import type Database from "better-sqlite3";

interface _ScanRow {
  scan_id: number;
  owner: string;
  package_name: string;
  scan_completed_at: string;
}

interface _PackageVersionPayloadRow {
  version_id: number;
  raw_json: string;
}

interface _ManifestPayloadRow {
  digest: string;
  raw_json: string;
}

export class SnapshotRepository {
  readonly #database: Database.Database;

  constructor(database: Database.Database) {
    this.#database = database;
  }

  getPackageMetadata(scanId: number): {
    owner: string;
    packageName: string;
    scanCompletedAt: string;
  } {
    const row = this.#database
      .prepare(
        `
          SELECT owner, package_name, scan_completed_at
          FROM package_scans
          WHERE scan_id = ?
        `
      )
      .get(scanId) as Pick<_ScanRow, "owner" | "package_name" | "scan_completed_at"> | undefined;
    if (row == null) {
      throw new Error(`database does not contain package scan for scan_id=${scanId}`);
    }
    if (!row.scan_completed_at) {
      throw new Error(`scan ${scanId} has not completed`);
    }

    return {
      owner: row.owner,
      packageName: row.package_name,
      scanCompletedAt: row.scan_completed_at
    };
  }

  countPackageVersions(scanId: number): number {
    return _count(this.#database, "SELECT COUNT(*) AS total FROM package_versions WHERE scan_id = ?", "total", scanId);
  }

  countTaggedVersions(scanId: number): number {
    return _count(
      this.#database,
      "SELECT COUNT(DISTINCT version_id) AS total FROM tags WHERE scan_id = ?",
      "total",
      scanId
    );
  }

  countTags(scanId: number): number {
    return _count(this.#database, "SELECT COUNT(*) AS total FROM tags WHERE scan_id = ?", "total", scanId);
  }

  countManifests(scanId: number): number {
    return _count(this.#database, "SELECT COUNT(*) AS total FROM manifests WHERE scan_id = ?", "total", scanId);
  }

  countManifestEdges(scanId: number): number {
    return _count(this.#database, "SELECT COUNT(*) AS total FROM manifest_edges WHERE scan_id = ?", "total", scanId);
  }

  listManifestDigests(scanId: number): string[] {
    const rows = this.#database
      .prepare("SELECT digest FROM manifests WHERE scan_id = ? ORDER BY digest")
      .all(scanId) as Array<{ digest: string }>;
    return rows.map((row) => row.digest);
  }

  listManifestPayloads(scanId: number): Array<{ digest: string; rawJson: string }> {
    const rows = this.#database
      .prepare(
        `
          SELECT digest, raw_json
          FROM manifest_payloads
          WHERE scan_id = ?
          ORDER BY digest
        `
      )
      .all(scanId) as _ManifestPayloadRow[];

    return rows.map((row) => ({
      digest: row.digest,
      rawJson: row.raw_json
    }));
  }

  listPackageVersionManifestRefs(scanId: number): Array<{ versionId: number; digest: string }> {
    const rows = this.#database
      .prepare(
        `
          SELECT version_id, raw_json
          FROM package_version_payloads
          WHERE scan_id = ?
          ORDER BY version_id
        `
      )
      .all(scanId) as _PackageVersionPayloadRow[];

    return rows.map((row) => ({
      versionId: row.version_id,
      digest: _parsePackageVersionDigest(row.version_id, row.raw_json)
    }));
  }
}

function _count(database: Database.Database, sql: string, field: string, ...params: unknown[]): number {
  const row = database.prepare(sql).get(...params) as Record<string, number>;
  return row[field];
}

function _parsePackageVersionDigest(versionId: number, rawJson: string): string {
  const payload = JSON.parse(rawJson) as { name?: unknown };
  if (typeof payload.name !== "string" || payload.name.length === 0) {
    throw new Error(`package version payload for version_id=${versionId} did not include digest name`);
  }

  return payload.name;
}
