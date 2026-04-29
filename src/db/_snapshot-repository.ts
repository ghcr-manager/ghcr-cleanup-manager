import type Database from "better-sqlite3";

interface _ScanRow {
  scan_id: number;
  package_name: string;
  scan_completed_at: string;
}

interface _VersionRow {
  version_id: number;
  digest: string;
  created_at: string;
}

export class SnapshotRepository {
  readonly #database: Database.Database;

  constructor(database: Database.Database) {
    this.#database = database;
  }

  getPackageMetadata(scanId: number): { packageName: string; scanCompletedAt: string } {
    const row = this.#database
      .prepare(
        `
          SELECT package_name, scan_completed_at
          FROM package_scans
          WHERE scan_id = ?
        `,
      )
      .get(scanId) as Pick<_ScanRow, "package_name" | "scan_completed_at"> | undefined;
    if (!row) {
      throw new Error(`database does not contain package scan for scan_id=${scanId}`);
    }
    if (!row.scan_completed_at) {
      throw new Error(`scan ${scanId} has not completed`);
    }

    return {
      packageName: row.package_name,
      scanCompletedAt: row.scan_completed_at,
    };
  }

  getTaggedDigests(scanId: number): Set<string> {
    return _getDigestSet(
      this.#database.prepare("SELECT DISTINCT digest FROM tags WHERE scan_id = ?").all(scanId) as Array<{
        digest: string;
      }>,
      "digest",
    );
  }

  getDigestsForTags(scanId: number, tags: string[]): Set<string> {
    if (tags.length === 0) {
      return new Set();
    }

    const placeholders = tags.map(() => "?").join(", ");
    const rows = this.#database
      .prepare(`SELECT DISTINCT digest FROM tags WHERE scan_id = ? AND tag IN (${placeholders})`)
      .all(scanId, ...tags) as Array<{ digest: string }>;
    return _getDigestSet(rows, "digest");
  }

  getChildDigests(scanId: number, parentDigests: Iterable<string>): string[] {
    const digestList = [...parentDigests];
    if (digestList.length === 0) {
      return [];
    }

    const placeholders = digestList.map(() => "?").join(", ");
    const rows = this.#database
      .prepare(`SELECT child_digest FROM manifest_edges WHERE scan_id = ? AND parent_digest IN (${placeholders})`)
      .all(scanId, ...digestList) as Array<{ child_digest: string }>;
    return rows.map((row) => row.child_digest);
  }

  getVersionsCreatedBefore(scanId: number, cutoffTimestamp: string): Array<{ versionId: number; digest: string }> {
    const rows = this.#database
      .prepare(
        `
          SELECT version_id, digest
          FROM package_versions
          WHERE scan_id = ? AND created_at < ?
          ORDER BY version_id
        `,
      )
      .all(scanId, cutoffTimestamp) as _VersionRow[];

    return rows.map((row) => ({
      versionId: row.version_id,
      digest: row.digest,
    }));
  }

  getTaggedVersionIds(scanId: number): number[] {
    const rows = this.#database
      .prepare("SELECT DISTINCT version_id FROM tags WHERE scan_id = ? ORDER BY version_id")
      .all(scanId) as Array<{ version_id: number }>;
    return rows.map((row) => row.version_id);
  }

  countPackageVersions(scanId: number): number {
    return _count(this.#database, "SELECT COUNT(*) AS total FROM package_versions WHERE scan_id = ?", "total", scanId);
  }

  countTaggedVersions(scanId: number): number {
    return _count(
      this.#database,
      "SELECT COUNT(DISTINCT version_id) AS total FROM tags WHERE scan_id = ?",
      "total",
      scanId,
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

  listPackageVersionDigests(scanId: number): string[] {
    const rows = this.#database
      .prepare("SELECT digest FROM package_versions WHERE scan_id = ? ORDER BY version_id")
      .all(scanId) as Array<{ digest: string }>;
    return rows.map((row) => row.digest);
  }
}

function _getDigestSet(rows: Array<Record<string, string>>, key: string): Set<string> {
  return new Set(rows.map((row) => row[key] as string));
}

function _count(database: Database.Database, sql: string, field: string, ...params: unknown[]): number {
  const row = database.prepare(sql).get(...params) as Record<string, number>;
  return row[field] as number;
}
