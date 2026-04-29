import type Database from "better-sqlite3";
import type { PlanSummary } from "../core/index.js";

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

  getPackageMetadata(): { packageName: string; scanCompletedAt: string } {
    const row = this.#getActivePackageRow();
    if (!row) {
      throw new Error("database does not contain a completed package scan");
    }

    return {
      packageName: row.package_name,
      scanCompletedAt: row.scan_completed_at,
    };
  }

  getTaggedDigests(): Set<string> {
    const scanId = this.#requireActiveScanId();
    return _getDigestSet(
      this.#database.prepare("SELECT DISTINCT digest FROM tags WHERE scan_id = ?").all(scanId) as Array<{
        digest: string;
      }>,
      "digest",
    );
  }

  getDigestsForTags(tags: string[]): Set<string> {
    const scanId = this.#requireActiveScanId();
    if (tags.length === 0) {
      return new Set();
    }

    const placeholders = tags.map(() => "?").join(", ");
    const rows = this.#database
      .prepare(`SELECT DISTINCT digest FROM tags WHERE scan_id = ? AND tag IN (${placeholders})`)
      .all(scanId, ...tags) as Array<{ digest: string }>;
    return _getDigestSet(rows, "digest");
  }

  getChildDigests(parentDigests: Iterable<string>): string[] {
    const digestList = [...parentDigests];
    if (digestList.length === 0) {
      return [];
    }

    const placeholders = digestList.map(() => "?").join(", ");
    const scanId = this.#requireActiveScanId();
    const rows = this.#database
      .prepare(`SELECT child_digest FROM manifest_edges WHERE scan_id = ? AND parent_digest IN (${placeholders})`)
      .all(scanId, ...digestList) as Array<{ child_digest: string }>;
    return rows.map((row) => row.child_digest);
  }

  getVersionsCreatedBefore(cutoffTimestamp: string): Array<{ versionId: number; digest: string }> {
    const scanId = this.#requireActiveScanId();
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

  getTaggedVersionIds(): number[] {
    const scanId = this.#requireActiveScanId();
    const rows = this.#database
      .prepare("SELECT DISTINCT version_id FROM tags WHERE scan_id = ? ORDER BY version_id")
      .all(scanId) as Array<{ version_id: number }>;
    return rows.map((row) => row.version_id);
  }

  countPackageVersions(): number {
    return _count(
      this.#database,
      "SELECT COUNT(*) AS total FROM package_versions WHERE scan_id = ?",
      "total",
      this.#requireActiveScanId(),
    );
  }

  countTaggedVersions(): number {
    return _count(
      this.#database,
      "SELECT COUNT(DISTINCT version_id) AS total FROM tags WHERE scan_id = ?",
      "total",
      this.#requireActiveScanId(),
    );
  }

  countTags(): number {
    return _count(
      this.#database,
      "SELECT COUNT(*) AS total FROM tags WHERE scan_id = ?",
      "total",
      this.#requireActiveScanId(),
    );
  }

  countManifests(): number {
    return _count(
      this.#database,
      "SELECT COUNT(*) AS total FROM manifests WHERE scan_id = ?",
      "total",
      this.#requireActiveScanId(),
    );
  }

  countManifestEdges(): number {
    return _count(
      this.#database,
      "SELECT COUNT(*) AS total FROM manifest_edges WHERE scan_id = ?",
      "total",
      this.#requireActiveScanId(),
    );
  }

  listPackageVersionDigests(): string[] {
    const rows = this.#database
      .prepare("SELECT digest FROM package_versions WHERE scan_id = ? ORDER BY version_id")
      .all(this.#requireActiveScanId()) as Array<{ digest: string }>;
    return rows.map((row) => row.digest);
  }

  buildPlanSummary(protectedVersionIds: number[], deletableVersionIds: number[]): PlanSummary {
    const metadata = this.getPackageMetadata();
    return {
      packageName: metadata.packageName,
      scanCompletedAt: metadata.scanCompletedAt,
      totalPackageVersions: this.countPackageVersions(),
      totalTaggedVersions: this.countTaggedVersions(),
      protectedVersionIds: [...protectedVersionIds].sort((left, right) => left - right),
      deletableVersionIds: [...deletableVersionIds].sort((left, right) => left - right),
    };
  }

  #getActivePackageRow(): _ScanRow | undefined {
    return this.#database
      .prepare(
        `
          SELECT scan_id, package_name, scan_completed_at
          FROM package_scans
          WHERE status = 'completed' AND scan_completed_at IS NOT NULL
          ORDER BY scan_completed_at DESC, scan_id DESC
          LIMIT 1
        `,
      )
      .get() as _ScanRow | undefined;
  }

  #requireActiveScanId(): number {
    const row = this.#getActivePackageRow();
    if (!row) {
      throw new Error("database does not contain a completed package scan");
    }

    return row.scan_id;
  }
}

function _getDigestSet(rows: Array<Record<string, string>>, key: string): Set<string> {
  return new Set(rows.map((row) => row[key] as string));
}

function _count(database: Database.Database, sql: string, field: string, ...params: unknown[]): number {
  const row = database.prepare(sql).get(...params) as Record<string, number>;
  return row[field] as number;
}
