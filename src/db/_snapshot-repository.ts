import type Database from "better-sqlite3";
import { buildInClausePlaceholders } from "./_sql-placeholders.js";

interface _ScanRow {
  scan_id: number;
  owner: string;
  package_name: string;
  scan_completed_at: string;
  is_public: number;
}

interface _VersionRow {
  version_id: number;
  digest: string;
  created_at: string;
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
    isPublic: boolean;
    scanCompletedAt: string;
  } {
    const row = this.#database
      .prepare(
        `
          SELECT owner, package_name, is_public, scan_completed_at
          FROM package_scans
          WHERE scan_id = ?
        `
      )
      .get(scanId) as Pick<_ScanRow, "owner" | "package_name" | "is_public" | "scan_completed_at"> | undefined;
    if (!row) {
      throw new Error(`database does not contain package scan for scan_id=${scanId}`);
    }
    if (!row.scan_completed_at) {
      throw new Error(`scan ${scanId} has not completed`);
    }

    return {
      owner: row.owner,
      packageName: row.package_name,
      isPublic: row.is_public === 1,
      scanCompletedAt: row.scan_completed_at
    };
  }

  hasAnyNonPublicPackageScan(owner: string, packageName: string): boolean {
    const row = this.#database
      .prepare(
        `
          SELECT 1 AS has_non_public
          FROM package_scans
          WHERE owner = ?
            AND package_name = ?
            AND is_public = 0
          LIMIT 1
        `
      )
      .get(owner, packageName) as { has_non_public: 1 } | undefined;

    return row !== undefined;
  }

  getTaggedDigests(scanId: number): Set<string> {
    return _getDigestSet(
      this.#database
        .prepare(
          `
            SELECT DISTINCT m.digest
            FROM tags t
            JOIN manifests m
              ON m.scan_id = t.scan_id
             AND m.version_id = t.version_id
            WHERE t.scan_id = ?
          `
        )
        .all(scanId) as Array<{ digest: string }>,
      "digest"
    );
  }

  getDigestsForTags(scanId: number, tags: string[]): Set<string> {
    if (tags.length === 0) {
      return new Set();
    }

    const placeholders = buildInClausePlaceholders(tags.length);
    const rows = this.#database
      .prepare(
        `
          SELECT DISTINCT m.digest
          FROM tags t
          JOIN manifests m
            ON m.scan_id = t.scan_id
           AND m.version_id = t.version_id
          WHERE t.scan_id = ? AND t.tag IN (${placeholders})
        `
      )
      .all(scanId, ...tags) as Array<{ digest: string }>;
    return _getDigestSet(rows, "digest");
  }

  getChildDigests(scanId: number, parentDigests: Iterable<string>): string[] {
    const digestList = [...parentDigests];
    if (digestList.length === 0) {
      return [];
    }

    const placeholders = buildInClausePlaceholders(digestList.length);
    const rows = this.#database
      .prepare(`SELECT child_digest FROM manifest_edges WHERE scan_id = ? AND parent_digest IN (${placeholders})`)
      .all(scanId, ...digestList) as Array<{ child_digest: string }>;
    return rows.map((row) => row.child_digest);
  }

  getVersionsCreatedBefore(scanId: number, cutoffTimestamp: string): Array<{ versionId: number; digest: string }> {
    const rows = this.#database
      .prepare(
        `
          SELECT pv.version_id, m.digest
          FROM package_versions pv
          JOIN manifests m
            ON m.scan_id = pv.scan_id
           AND m.version_id = pv.version_id
          WHERE pv.scan_id = ? AND pv.created_at < ?
          ORDER BY version_id
        `
      )
      .all(scanId, cutoffTimestamp) as _VersionRow[];

    return rows.map((row) => ({
      versionId: row.version_id,
      digest: row.digest
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

function _getDigestSet(rows: Array<Record<string, string>>, key: string): Set<string> {
  return new Set(rows.map((row) => row[key] as string));
}

function _count(database: Database.Database, sql: string, field: string, ...params: unknown[]): number {
  const row = database.prepare(sql).get(...params) as Record<string, number>;
  return row[field] as number;
}

function _parsePackageVersionDigest(versionId: number, rawJson: string): string {
  const payload = JSON.parse(rawJson) as { name?: unknown };
  if (typeof payload.name !== "string" || payload.name.length === 0) {
    throw new Error(`package version payload for version_id=${versionId} did not include digest name`);
  }

  return payload.name;
}
