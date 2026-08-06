import type Database from "better-sqlite3";
import { realpathSync } from "node:fs";
import { DbMergeCleanupCopy } from "./_db-merge-cleanup-copy.js";
import { resolveCleanupHistoryRelation } from "./_db-merge-history.js";
import { DbMergeScanCopy } from "./_db-merge-scan-copy.js";
import type { DbMergeSourceSummary, SourceScanRow, TargetScanRow } from "./_db-merge-types.js";

export type { DbMergeSourceSummary } from "./_db-merge-types.js";

export class DbMergeRepository {
  readonly #database: Database.Database;
  readonly #cleanupCopy: DbMergeCleanupCopy;
  readonly #scanCopy: DbMergeScanCopy;

  constructor(database: Database.Database) {
    this.#database = database;
    this.#cleanupCopy = new DbMergeCleanupCopy(database);
    this.#scanCopy = new DbMergeScanCopy(database);
  }

  mergeSourceDatabase(sourceDatabasePath: string): DbMergeSourceSummary {
    const targetPath = realpathSync(this.#database.name);
    const sourcePath = realpathSync(sourceDatabasePath);
    if (targetPath === sourcePath) {
      throw new Error(`source DB matches target DB: ${sourceDatabasePath}`);
    }

    const attachName = "merge_source";
    const quotedAttachName = `"${attachName}"`;
    this.#database.exec(`ATTACH DATABASE ${this.#scanCopy.quoteDatabasePath(sourcePath)} AS ${quotedAttachName}`);

    try {
      return this.#database.transaction(() => this.#mergeAttachedSource(attachName, sourceDatabasePath))();
    } finally {
      this.#database.exec(`DETACH DATABASE ${quotedAttachName}`);
    }
  }

  #mergeAttachedSource(attachName: string, sourceDatabasePath: string): DbMergeSourceSummary {
    const sourceScans = this.#database
      .prepare(
        `
          SELECT
            scan_id,
            scan_uuid,
            owner,
            package_name,
            package_metadata_json,
            github_actions_run_url,
            scan_started_at,
            scan_completed_at,
            status
          FROM ${attachName}.package_scans
          ORDER BY scan_started_at, scan_uuid
        `
      )
      .all() as SourceScanRow[];
    const summary: DbMergeSourceSummary = {
      sourceDatabasePath,
      importedScanCount: 0,
      skippedScanCount: 0,
      importedCleanupRunCount: 0,
      skippedCleanupRunCount: 0
    };

    for (const sourceScan of sourceScans) {
      const targetScan = this.#database
        .prepare(
          `
            SELECT
              scan_id,
              scan_uuid,
              owner,
              package_name,
              package_metadata_json,
              github_actions_run_url,
              scan_started_at,
              scan_completed_at,
              status
            FROM package_scans
            WHERE scan_uuid = ?
          `
        )
        .get(sourceScan.scan_uuid) as TargetScanRow | undefined;

      if (targetScan == null) {
        const targetScanId = this.#scanCopy.insertScan(sourceScan);
        this.#scanCopy.copyScanRows(attachName, sourceScan.scan_id, targetScanId);
        summary.importedScanCount += 1;
        summary.importedCleanupRunCount += this.#cleanupCopy.copyCleanupRuns(
          attachName,
          sourceScan.scan_id,
          targetScanId,
          []
        );
        continue;
      }

      this.#scanCopy.assertMatchingScanMetadata(sourceScan, targetScan, sourceDatabasePath);
      const sourceCleanupUuids = this.#cleanupCopy.listCleanupUuids(`${attachName}.cleanup_runs`, sourceScan.scan_id);
      const targetCleanupUuids = this.#cleanupCopy.listCleanupUuids("cleanup_runs", targetScan.scan_id);
      const historyRelation = resolveCleanupHistoryRelation(sourceCleanupUuids, targetCleanupUuids);

      if (historyRelation === "source-ahead") {
        summary.importedCleanupRunCount += this.#cleanupCopy.copyCleanupRuns(
          attachName,
          sourceScan.scan_id,
          targetScan.scan_id,
          targetCleanupUuids
        );
      } else if (historyRelation === "target-ahead") {
        summary.skippedCleanupRunCount += sourceCleanupUuids.length;
      } else {
        throw new Error(
          `cleanup history diverged for scan_uuid ${sourceScan.scan_uuid} while merging ${sourceDatabasePath}`
        );
      }

      summary.skippedScanCount += 1;
    }

    return summary;
  }
}
