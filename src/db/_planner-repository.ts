import type Database from "better-sqlite3";
import { buildInClausePlaceholders, buildTuplePlaceholders } from "./_sql-placeholders.js";

interface _PlannerLogger {
  trace(message: string): void;
  debug(message: string): void;
}

interface _ScanRow {
  scan_id: number;
  owner: string;
  package_name: string;
  scan_completed_at: string;
}

interface _PlanRootRow {
  version_id: number;
  root_digest: string;
  root_manifest_kind: string | null;
  direct_target_reason: string;
  selection_mode: string;
}

interface _PlanTagRow {
  target_tag: string;
}

interface _ClosureManifestRow {
  source_version_id: number;
  source_digest: string;
  member_version_id: number;
  member_digest: string;
  member_manifest_kind: string | null;
  hops_from_root: number;
  member_role: string;
}

interface _BlockedRootRow {
  blocked_version_id: number;
  blocked_digest: string;
  blocking_version_id: number;
  blocking_digest: string;
  overlap_digest: string;
  overlap_manifest_kind: string | null;
  block_reason: string;
}

export interface DeletePlanRoot {
  versionId: number;
  digest: string;
  manifestKind?: string;
  reason: string;
  selectionMode: string;
}

export interface DeletePlanClosureManifest {
  sourceVersionId: number;
  sourceDigest: string;
  memberVersionId: number;
  memberDigest: string;
  memberManifestKind?: string;
  hopsFromRoot: number;
  memberRole: string;
}

export interface DeletePlanBlockedRoot {
  blockedVersionId: number;
  blockedDigest: string;
  blockingVersionId: number;
  blockingDigest: string;
  overlapDigest: string;
  overlapManifestKind?: string;
  reason: string;
}

export interface DeletePlan {
  owner: string;
  packageName: string;
  scanCompletedAt: string;
  plannerInputs: {
    deleteUntagged: boolean;
    deleteTags: string[];
    excludeTags: string[];
    keepNTagged?: number;
    keepNUntagged?: number;
    olderThan?: string;
    cutoffTimestamp?: string;
  };
  directTargetTags: string[];
  directTargetRoots: DeletePlanRoot[];
  closureManifests: DeletePlanClosureManifest[];
  blockedRoots: DeletePlanBlockedRoot[];
  fullyDeletableRoots: DeletePlanRoot[];
  collateralTags: string[];
}

export class PlannerRepository {
  readonly #database: Database.Database;
  readonly #logger: _PlannerLogger;

  constructor(database: Database.Database, logger: _PlannerLogger = _silentPlannerLogger) {
    this.#database = database;
    this.#logger = logger;
  }

  getDeleteUntaggedPlan(owner: string, packageName: string): DeletePlan {
    return this.getDeleteUntaggedPlanWithCutoff(owner, packageName);
  }

  getKeepNUntaggedPlan(owner: string, packageName: string, keepCount: number): DeletePlan {
    return this.getKeepNUntaggedPlanWithCutoff(owner, packageName, keepCount);
  }

  getKeepNTaggedPlan(owner: string, packageName: string, keepCount: number): DeletePlan {
    return this.getKeepNTaggedPlanWithCutoff(owner, packageName, keepCount, []);
  }

  getDeleteUntaggedPlanWithCutoff(
    owner: string,
    packageName: string,
    options?: {
      olderThan?: string;
      cutoffTimestamp?: string;
    }
  ): DeletePlan {
    const scan = this.#getLatestCompletedScan(owner, packageName);
    const directTargetRoots = this.#listDeleteUntaggedDirectTargetRoots(scan.scan_id, options?.cutoffTimestamp);
    const deleteRootCandidates = this.#listDeleteRootCandidates(directTargetRoots);
    const blockedRoots = this.#listBlockedRoots(scan.scan_id, deleteRootCandidates);
    const blockedVersionIds = new Set(blockedRoots.map((root) => root.blockedVersionId));
    const fullyDeletableRoots = deleteRootCandidates.filter((root) => !blockedVersionIds.has(root.versionId));

    return {
      owner: scan.owner,
      packageName: scan.package_name,
      scanCompletedAt: scan.scan_completed_at,
      plannerInputs: {
        deleteUntagged: true,
        deleteTags: [],
        excludeTags: [],
        keepNTagged: undefined,
        keepNUntagged: undefined,
        olderThan: options?.olderThan,
        cutoffTimestamp: options?.cutoffTimestamp
      },
      directTargetTags: [],
      directTargetRoots,
      closureManifests: this.#listClosureManifests(scan.scan_id, deleteRootCandidates),
      blockedRoots,
      fullyDeletableRoots,
      collateralTags: []
    };
  }

  getKeepNUntaggedPlanWithCutoff(
    owner: string,
    packageName: string,
    keepCount: number,
    options?: {
      olderThan?: string;
      cutoffTimestamp?: string;
    }
  ): DeletePlan {
    const scan = this.#getLatestCompletedScan(owner, packageName);
    const directTargetRoots = this.#listKeepNUntaggedDirectTargetRoots(
      scan.scan_id,
      keepCount,
      options?.cutoffTimestamp
    );
    const deleteRootCandidates = this.#listDeleteRootCandidates(directTargetRoots);
    const blockedRoots = this.#listBlockedRoots(scan.scan_id, deleteRootCandidates);
    const blockedVersionIds = new Set(blockedRoots.map((root) => root.blockedVersionId));
    const fullyDeletableRoots = deleteRootCandidates.filter((root) => !blockedVersionIds.has(root.versionId));

    return {
      owner: scan.owner,
      packageName: scan.package_name,
      scanCompletedAt: scan.scan_completed_at,
      plannerInputs: {
        deleteUntagged: false,
        deleteTags: [],
        excludeTags: [],
        keepNTagged: undefined,
        keepNUntagged: keepCount,
        olderThan: options?.olderThan,
        cutoffTimestamp: options?.cutoffTimestamp
      },
      directTargetTags: [],
      directTargetRoots,
      closureManifests: this.#listClosureManifests(scan.scan_id, deleteRootCandidates),
      blockedRoots,
      fullyDeletableRoots,
      collateralTags: []
    };
  }

  getKeepNTaggedPlanWithCutoff(
    owner: string,
    packageName: string,
    keepCount: number,
    excludeTags: string[],
    options?: {
      olderThan?: string;
      cutoffTimestamp?: string;
    }
  ): DeletePlan {
    const scan = this.#getLatestCompletedScan(owner, packageName);
    const directTargetRoots = this.#listTaggedDirectTargetRoots(scan.scan_id, {
      deleteTags: [],
      excludeTags,
      keepCount,
      cutoffTimestamp: options?.cutoffTimestamp
    });
    const deleteRootCandidates = this.#listDeleteRootCandidates(directTargetRoots);
    const blockedRoots = this.#listBlockedRoots(scan.scan_id, deleteRootCandidates);
    const blockedVersionIds = new Set(blockedRoots.map((root) => root.blockedVersionId));
    const fullyDeletableRoots = deleteRootCandidates.filter((root) => !blockedVersionIds.has(root.versionId));

    return {
      owner: scan.owner,
      packageName: scan.package_name,
      scanCompletedAt: scan.scan_completed_at,
      plannerInputs: {
        deleteUntagged: false,
        deleteTags: [],
        excludeTags,
        keepNTagged: keepCount,
        keepNUntagged: undefined,
        olderThan: options?.olderThan,
        cutoffTimestamp: options?.cutoffTimestamp
      },
      directTargetTags: [],
      directTargetRoots,
      closureManifests: this.#listClosureManifests(scan.scan_id, deleteRootCandidates),
      blockedRoots,
      fullyDeletableRoots,
      collateralTags: []
    };
  }

  getDeleteTagsPlan(owner: string, packageName: string, deleteTags: string[], excludeTags: string[]): DeletePlan {
    return this.getDeleteTagsPlanWithCutoff(owner, packageName, deleteTags, excludeTags);
  }

  getDeleteTagsPlanWithCutoff(
    owner: string,
    packageName: string,
    deleteTags: string[],
    excludeTags: string[],
    options?: {
      keepNTagged?: number;
      olderThan?: string;
      cutoffTimestamp?: string;
    }
  ): DeletePlan {
    const scan = this.#getLatestCompletedScan(owner, packageName);
    const directTargetTags = this.#listDeleteTagDirectTargetTags(
      scan.scan_id,
      deleteTags,
      excludeTags,
      options?.cutoffTimestamp
    );
    const directTargetRoots = this.#listTaggedDirectTargetRoots(scan.scan_id, {
      deleteTags,
      excludeTags,
      keepCount: options?.keepNTagged,
      cutoffTimestamp: options?.cutoffTimestamp
    });
    const deleteRootCandidates = this.#listDeleteRootCandidates(directTargetRoots);
    const blockedRoots = this.#listBlockedRoots(scan.scan_id, deleteRootCandidates);
    const blockedVersionIds = new Set(blockedRoots.map((root) => root.blockedVersionId));
    const fullyDeletableRoots = deleteRootCandidates.filter((root) => !blockedVersionIds.has(root.versionId));

    return {
      owner: scan.owner,
      packageName: scan.package_name,
      scanCompletedAt: scan.scan_completed_at,
      plannerInputs: {
        deleteUntagged: false,
        deleteTags,
        excludeTags,
        keepNTagged: options?.keepNTagged,
        keepNUntagged: undefined,
        olderThan: options?.olderThan,
        cutoffTimestamp: options?.cutoffTimestamp
      },
      directTargetTags,
      directTargetRoots,
      closureManifests: this.#listClosureManifests(scan.scan_id, deleteRootCandidates),
      blockedRoots,
      fullyDeletableRoots,
      collateralTags: []
    };
  }

  #getLatestCompletedScan(owner: string, packageName: string): _ScanRow {
    const sql = `
          SELECT scan_id, owner, package_name, scan_completed_at
          FROM package_scans
          WHERE owner = ?
            AND package_name = ?
            AND status = 'completed'
            AND scan_completed_at IS NOT NULL
          ORDER BY scan_completed_at DESC, scan_id DESC
          LIMIT 1
        `;
    const row = this.#get<_ScanRow>(sql, [owner, packageName]);
    if (!row) {
      throw new Error(`database does not contain completed package scan for ${owner}/${packageName}`);
    }

    return row;
  }

  #listDeleteUntaggedDirectTargetRoots(scanId: number, cutoffTimestamp?: string): DeletePlanRoot[] {
    const cutoffSql = cutoffTimestamp ? "AND created_at < ?" : "";
    const sql = `
          SELECT
            root_version_id AS version_id,
            root_digest,
            root_manifest_kind,
            'delete-untagged' AS direct_target_reason,
            'delete-root' AS selection_mode
          FROM v_scan_root_manifests
          WHERE scan_id = ?
            AND is_tagged = 0
            AND has_ancestor = 0
            ${cutoffSql}
          ORDER BY root_digest
        `;
    const rows = this.#all<_PlanRootRow>(sql, [scanId, ...(cutoffTimestamp ? [cutoffTimestamp] : [])]);

    return rows.map((row) => ({
      versionId: row.version_id,
      digest: row.root_digest,
      manifestKind: row.root_manifest_kind ?? undefined,
      reason: row.direct_target_reason,
      selectionMode: row.selection_mode
    }));
  }

  #listKeepNUntaggedDirectTargetRoots(scanId: number, keepCount: number, cutoffTimestamp?: string): DeletePlanRoot[] {
    const cutoffSql = cutoffTimestamp ? "AND pv.created_at < ?" : "";
    const sql = `
          WITH eligible_untagged_roots AS (
            SELECT
              pv.version_id AS version_id,
              m.digest AS root_digest,
              m.manifest_kind AS root_manifest_kind,
              ROW_NUMBER() OVER (
                ORDER BY pv.created_at DESC, pv.version_id DESC, m.digest DESC
              ) AS recency_rank
            FROM package_versions pv
            JOIN manifests m
              ON m.scan_id = pv.scan_id
             AND m.version_id = pv.version_id
            WHERE pv.scan_id = ?
              AND NOT EXISTS (
                SELECT 1
                FROM tags t
                WHERE t.scan_id = pv.scan_id
                  AND t.version_id = pv.version_id
              )
              AND NOT EXISTS (
                SELECT 1
                FROM manifest_reachability mr
                WHERE mr.scan_id = pv.scan_id
                  AND mr.descendant_digest = m.digest
                  AND mr.min_distance > 0
              )
              ${cutoffSql}
          )
          SELECT
            version_id,
            root_digest,
            root_manifest_kind,
            'keep-n-untagged-overflow' AS direct_target_reason,
            'delete-root' AS selection_mode
          FROM eligible_untagged_roots
          WHERE recency_rank > ?
          ORDER BY root_digest
        `;
    const rows = this.#all<_PlanRootRow>(sql, [scanId, ...(cutoffTimestamp ? [cutoffTimestamp] : []), keepCount]);

    return rows.map((row) => ({
      versionId: row.version_id,
      digest: row.root_digest,
      manifestKind: row.root_manifest_kind ?? undefined,
      reason: row.direct_target_reason,
      selectionMode: row.selection_mode
    }));
  }

  #listDeleteTagDirectTargetTags(
    scanId: number,
    deleteTags: string[],
    excludeTags: string[],
    cutoffTimestamp?: string
  ): string[] {
    if (deleteTags.length === 0) {
      return [];
    }

    const selectedTagPlaceholders = buildInClausePlaceholders(deleteTags.length);
    const params: Array<number | string> = [scanId, ...deleteTags];
    let excludedRootSql = "";
    let olderThanSql = "";
    if (excludeTags.length > 0) {
      const excludedTagPlaceholders = buildInClausePlaceholders(excludeTags.length);
      excludedRootSql = `
        AND t.version_id NOT IN (
          SELECT version_id
          FROM tags
          WHERE scan_id = ?
            AND tag IN (${excludedTagPlaceholders})
        )
      `;
      params.push(scanId, ...excludeTags);
    }
    if (cutoffTimestamp) {
      olderThanSql = "AND pv.created_at < ?";
      params.push(cutoffTimestamp);
    }

    const sql = `
          SELECT tag AS target_tag
          FROM tags t
          JOIN package_versions pv
            ON pv.scan_id = t.scan_id
           AND pv.version_id = t.version_id
          WHERE t.scan_id = ?
            AND t.tag IN (${selectedTagPlaceholders})
            ${excludedRootSql}
            ${olderThanSql}
          ORDER BY tag
        `;
    const rows = this.#all<_PlanTagRow>(sql, params);

    return rows.map((row) => row.target_tag);
  }

  #listTaggedDirectTargetRoots(
    scanId: number,
    options: {
      deleteTags: string[];
      excludeTags: string[];
      keepCount?: number;
      cutoffTimestamp?: string;
    }
  ): DeletePlanRoot[] {
    if (options.deleteTags.length === 0) {
      return this.#listKeepNTaggedDirectTargetRoots(
        scanId,
        options.excludeTags,
        options.keepCount,
        options.cutoffTimestamp
      );
    }

    return this.#listDeleteTagMatchedDirectTargetRoots(
      scanId,
      options.deleteTags,
      options.excludeTags,
      options.keepCount,
      options.cutoffTimestamp
    );
  }

  #listKeepNTaggedDirectTargetRoots(
    scanId: number,
    excludeTags: string[],
    keepCount?: number,
    cutoffTimestamp?: string
  ): DeletePlanRoot[] {
    const excludedTagPlaceholders = excludeTags.length > 0 ? buildInClausePlaceholders(excludeTags.length) : "";
    const excludedRootSql =
      excludeTags.length > 0
        ? `
              AND NOT EXISTS (
                SELECT 1
                FROM tags xt
                WHERE xt.scan_id = pv.scan_id
                  AND xt.version_id = pv.version_id
                  AND xt.tag IN (${excludedTagPlaceholders})
              )
            `
        : "";
    const cutoffSql = cutoffTimestamp ? "AND pv.created_at < ?" : "";
    const keepSql = keepCount !== undefined ? "WHERE recency_rank > ?" : "";
    const params: Array<number | string> = [scanId, ...excludeTags];
    if (cutoffTimestamp) {
      params.push(cutoffTimestamp);
    }
    if (keepCount !== undefined) {
      params.push(keepCount);
    }

    const sql = `
          WITH eligible_tagged_roots AS (
            SELECT
              pv.version_id AS version_id,
              m.digest AS root_digest,
              m.manifest_kind AS root_manifest_kind,
              ROW_NUMBER() OVER (
                ORDER BY pv.created_at DESC, pv.version_id DESC, m.digest DESC
              ) AS recency_rank
            FROM package_versions pv
            JOIN manifests m
              ON m.scan_id = pv.scan_id
             AND m.version_id = pv.version_id
            WHERE pv.scan_id = ?
              AND EXISTS (
                SELECT 1
                FROM tags t
                WHERE t.scan_id = pv.scan_id
                  AND t.version_id = pv.version_id
              )
              ${excludedRootSql}
              AND NOT EXISTS (
                SELECT 1
                FROM manifest_reachability mr
                WHERE mr.scan_id = pv.scan_id
                  AND mr.descendant_digest = m.digest
                  AND mr.min_distance > 0
              )
              ${cutoffSql}
          )
          SELECT
            version_id,
            root_digest,
            root_manifest_kind,
            'keep-n-tagged-overflow' AS direct_target_reason,
            'delete-root' AS selection_mode
          FROM eligible_tagged_roots
          ${keepSql}
          ORDER BY root_digest
        `;
    const rows = this.#all<_PlanRootRow>(sql, params);

    return rows.map((row) => ({
      versionId: row.version_id,
      digest: row.root_digest,
      manifestKind: row.root_manifest_kind ?? undefined,
      reason: row.direct_target_reason,
      selectionMode: row.selection_mode
    }));
  }

  #listDeleteTagMatchedDirectTargetRoots(
    scanId: number,
    deleteTags: string[],
    excludeTags: string[],
    keepCount?: number,
    cutoffTimestamp?: string
  ): DeletePlanRoot[] {
    const selectedTagPlaceholders = deleteTags.length > 0 ? buildInClausePlaceholders(deleteTags.length) : "";
    const excludedTagPlaceholders = excludeTags.length > 0 ? buildInClausePlaceholders(excludeTags.length) : "";
    const excludedRootSql =
      excludeTags.length > 0
        ? `
              AND NOT EXISTS (
                SELECT 1
                FROM tags xt
                WHERE xt.scan_id = mt.scan_id
                  AND xt.version_id = mt.version_id
                  AND xt.tag IN (${excludedTagPlaceholders})
              )
            `
        : "";
    const cutoffSql = cutoffTimestamp ? "AND pv.created_at < ?" : "";
    const keepSql = keepCount !== undefined ? "WHERE recency_rank > ?" : "";
    const params: Array<number | string> = [scanId, ...deleteTags, ...excludeTags];
    if (cutoffTimestamp) {
      params.push(cutoffTimestamp);
    }
    params.push(...deleteTags, scanId);
    const tailParams: Array<number> = [keepCount !== undefined ? 1 : 0];
    if (keepCount !== undefined) {
      tailParams.push(keepCount);
    }

    const sql = `
          WITH matched_candidate_roots AS (
            SELECT DISTINCT
              mt.version_id AS version_id,
              m.digest AS root_digest,
              m.manifest_kind AS root_manifest_kind,
              pv.created_at
            FROM tags mt
            JOIN manifests m
              ON m.scan_id = mt.scan_id
             AND m.version_id = mt.version_id
            JOIN package_versions pv
              ON pv.scan_id = mt.scan_id
             AND pv.version_id = mt.version_id
            WHERE mt.scan_id = ?
              AND mt.tag IN (${selectedTagPlaceholders})
              ${excludedRootSql}
              ${cutoffSql}
              AND NOT EXISTS (
                SELECT 1
                FROM manifest_reachability mr
                WHERE mr.scan_id = mt.scan_id
                  AND mr.descendant_digest = m.digest
                  AND mr.min_distance > 0
              )
          ),
          matched_roots AS (
            SELECT
              mcr.version_id,
              mcr.root_digest,
              mcr.root_manifest_kind,
              mcr.created_at,
              COUNT(t.tag) AS total_tag_count,
              SUM(CASE WHEN t.tag IN (${selectedTagPlaceholders}) THEN 1 ELSE 0 END) AS matched_tag_count
            FROM matched_candidate_roots mcr
            JOIN tags t
              ON t.scan_id = ?
             AND t.version_id = mcr.version_id
            GROUP BY mcr.version_id, mcr.root_digest, mcr.root_manifest_kind, mcr.created_at
            HAVING matched_tag_count > 0
          ),
          ranked_roots AS (
            SELECT
              version_id,
              root_digest,
              root_manifest_kind,
              total_tag_count,
              matched_tag_count,
              ROW_NUMBER() OVER (
                ORDER BY created_at DESC, version_id DESC, root_digest DESC
              ) AS recency_rank
            FROM matched_roots
          )
          SELECT
            version_id,
            root_digest,
            root_manifest_kind,
            CASE
              WHEN total_tag_count = matched_tag_count AND ? = 1
                THEN 'keep-n-tagged-overflow'
              WHEN total_tag_count = matched_tag_count
                THEN 'delete-tags-all-tags-selected'
              ELSE 'delete-tags-partial-tag-match'
            END AS direct_target_reason,
            CASE
              WHEN total_tag_count = matched_tag_count
                THEN 'delete-root'
              ELSE 'untag-only'
            END AS selection_mode
          FROM ranked_roots
          ${keepSql}
          ORDER BY root_digest
        `;
    const rows = this.#all<_PlanRootRow>(sql, [...params, ...tailParams]);

    return rows.map((row) => ({
      versionId: row.version_id,
      digest: row.root_digest,
      manifestKind: row.root_manifest_kind ?? undefined,
      reason: row.direct_target_reason,
      selectionMode: row.selection_mode
    }));
  }

  #listClosureManifests(scanId: number, directTargetRoots: DeletePlanRoot[]): DeletePlanClosureManifest[] {
    if (directTargetRoots.length === 0) {
      return [];
    }

    const directTargetRootsSql = buildTuplePlaceholders(directTargetRoots.length, 2);
    const directTargetRootParams = directTargetRoots.flatMap((root) => [root.versionId, root.digest]);
    const sql = `
          WITH direct_target_roots(root_version_id, root_digest) AS (
            VALUES ${directTargetRootsSql}
          )
          SELECT
            c.root_version_id AS source_version_id,
            c.root_digest AS source_digest,
            c.member_version_id,
            c.member_digest,
            c.member_manifest_kind,
            c.hops_from_root,
            c.member_role
          FROM v_scan_root_closure c
          JOIN direct_target_roots dtr
            ON dtr.root_version_id = c.root_version_id
           AND dtr.root_digest = c.root_digest
          WHERE c.scan_id = ?
          ORDER BY c.root_digest, c.hops_from_root, c.member_digest
        `;
    const rows = this.#all<_ClosureManifestRow>(sql, [...directTargetRootParams, scanId]);

    return rows.map((row) => ({
      sourceVersionId: row.source_version_id,
      sourceDigest: row.source_digest,
      memberVersionId: row.member_version_id,
      memberDigest: row.member_digest,
      memberManifestKind: row.member_manifest_kind ?? undefined,
      hopsFromRoot: row.hops_from_root,
      memberRole: row.member_role
    }));
  }

  #listBlockedRoots(scanId: number, directTargetRoots: DeletePlanRoot[]): DeletePlanBlockedRoot[] {
    if (directTargetRoots.length === 0) {
      return [];
    }

    const directTargetRootsSql = buildTuplePlaceholders(directTargetRoots.length, 2);
    const directTargetRootParams = directTargetRoots.flatMap((root) => [root.versionId, root.digest]);
    const sql = `
          WITH direct_target_roots(root_version_id, root_digest) AS (
            VALUES ${directTargetRootsSql}
          ),
          retained_roots AS (
            SELECT
              root_version_id,
              root_digest
            FROM v_scan_root_manifests
            WHERE scan_id = ?
              AND has_ancestor = 0
              AND root_digest NOT IN (SELECT root_digest FROM direct_target_roots)
          ),
          ranked_blocks AS (
            SELECT
              dtr.root_version_id AS blocked_version_id,
              dtr.root_digest AS blocked_digest,
              rr.root_version_id AS blocking_version_id,
              rr.root_digest AS blocking_digest,
              overlap.overlap_digest,
              overlap.overlap_manifest_kind,
              'overlap-with-retained-root' AS block_reason,
              ROW_NUMBER() OVER (
                PARTITION BY dtr.root_digest, rr.root_digest
                ORDER BY
                  overlap.hops_source_to_overlap_manifest,
                  overlap.hops_overlapping_root_to_overlap_manifest,
                  overlap.overlap_digest
              ) AS rn
            FROM direct_target_roots dtr
            JOIN v_scan_root_overlap overlap
              ON overlap.scan_id = ?
             AND overlap.source_digest = dtr.root_digest
            JOIN retained_roots rr
              ON rr.root_digest = overlap.overlapping_digest
          )
          SELECT
            blocked_version_id,
            blocked_digest,
            blocking_version_id,
            blocking_digest,
            overlap_digest,
            overlap_manifest_kind,
            block_reason
          FROM ranked_blocks
          WHERE rn = 1
          ORDER BY blocked_digest, blocking_digest, overlap_digest
        `;
    const rows = this.#all<_BlockedRootRow>(sql, [...directTargetRootParams, scanId, scanId]);

    return rows.map((row) => ({
      blockedVersionId: row.blocked_version_id,
      blockedDigest: row.blocked_digest,
      blockingVersionId: row.blocking_version_id,
      blockingDigest: row.blocking_digest,
      overlapDigest: row.overlap_digest,
      overlapManifestKind: row.overlap_manifest_kind ?? undefined,
      reason: row.block_reason
    }));
  }

  #listDeleteRootCandidates(directTargetRoots: DeletePlanRoot[]): DeletePlanRoot[] {
    return directTargetRoots.filter((root) => root.selectionMode === "delete-root");
  }

  #get<T>(sql: string, params: Array<number | string>): T | undefined {
    this.#traceSql(sql, params);
    return this.#database.prepare(sql).get(...params) as T | undefined;
  }

  #all<T>(sql: string, params: Array<number | string>): T[] {
    this.#traceSql(sql, params);
    const rows = this.#database.prepare(sql).all(...params) as T[];
    this.#logger.debug(`SQL returned ${rows.length} row(s)`);
    return rows;
  }

  #traceSql(sql: string, params: Array<number | string>): void {
    this.#logger.trace(`SQL:\n${sql.trim()}\nPARAMS: ${JSON.stringify(params)}`);
  }
}

const _silentPlannerLogger: _PlannerLogger = {
  trace() {},
  debug() {}
};
