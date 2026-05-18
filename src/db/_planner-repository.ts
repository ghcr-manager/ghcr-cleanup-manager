import type Database from "better-sqlite3";
interface _PlannerLogger {
  trace(message: string): void;
  debug(message: string): void;
  warn?(message: string): void;
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

export interface DeletePlanRootDecision {
  versionId: number;
  digest: string;
  manifestKind?: string;
  selectionMode: string;
  selectionReason: string;
  validationStatus: "fully-deletable" | "blocked" | "untag-only";
  validationReasonCode:
    | "untag-only-partial-tag-match"
    | "fully-deletable-no-retained-overlap"
    | "blocked-overlap-with-retained-root";
  validationReason: string;
  blockingVersionId?: number;
  blockingDigest?: string;
  overlapDigest?: string;
  overlapManifestKind?: string;
}

export interface DeletePlanProtectedRoot {
  versionId: number;
  digest: string;
  blocks: Array<{
    blockedVersionId: number;
    blockedDigest: string;
    blockReasonCode: string;
    overlapDigest: string;
    overlapManifestKind?: string;
  }>;
}

interface _PlanArtifacts {
  closureManifests: DeletePlanClosureManifest[];
  blockedRoots: DeletePlanBlockedRoot[];
  fullyDeletableRoots: DeletePlanRoot[];
}

export interface DeletePlan {
  owner: string;
  packageName: string;
  scanCompletedAt: string;
  plannerInputs: {
    deleteUntagged: boolean;
    deleteGhostImages?: boolean;
    deletePartialImages?: boolean;
    deleteOrphanedImages?: boolean;
    deleteTags: string[];
    excludeTags: string[];
    keepNTagged?: number;
    keepNUntagged?: number;
    olderThan?: string;
    cutoffTimestamp?: string;
  };
  validationSummary: {
    directTargetTagCount: number;
    directTargetRootCount: number;
    deleteRootCandidateCount: number;
    untagOnlyRootCount: number;
    fullyDeletableRootCount: number;
    blockedDeleteRootCount: number;
    protectedRootCount: number;
  };
  directTargetTags: string[];
  directTargetRoots: DeletePlanRoot[];
  rootDecisions: DeletePlanRootDecision[];
  protectedRoots: DeletePlanProtectedRoot[];
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

  getLatestCompletedScanId(owner: string, packageName: string): number {
    return this.#getLatestCompletedScan(owner, packageName).scan_id;
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
    const planArtifacts = this.#buildPlanArtifacts(scan.scan_id, directTargetRoots);

    return {
      owner: scan.owner,
      packageName: scan.package_name,
      scanCompletedAt: scan.scan_completed_at,
      plannerInputs: {
        deleteUntagged: true,
        deleteGhostImages: undefined,
        deletePartialImages: undefined,
        deleteOrphanedImages: undefined,
        deleteTags: [],
        excludeTags: [],
        keepNTagged: undefined,
        keepNUntagged: undefined,
        olderThan: options?.olderThan,
        cutoffTimestamp: options?.cutoffTimestamp
      },
      ...this.#buildPlanOutputs([], directTargetRoots, planArtifacts)
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
    const planArtifacts = this.#buildPlanArtifacts(scan.scan_id, directTargetRoots);

    return {
      owner: scan.owner,
      packageName: scan.package_name,
      scanCompletedAt: scan.scan_completed_at,
      plannerInputs: {
        deleteUntagged: false,
        deleteGhostImages: undefined,
        deletePartialImages: undefined,
        deleteOrphanedImages: undefined,
        deleteTags: [],
        excludeTags: [],
        keepNTagged: undefined,
        keepNUntagged: keepCount,
        olderThan: options?.olderThan,
        cutoffTimestamp: options?.cutoffTimestamp
      },
      ...this.#buildPlanOutputs([], directTargetRoots, planArtifacts)
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
    const planArtifacts = this.#buildPlanArtifacts(scan.scan_id, directTargetRoots);

    return {
      owner: scan.owner,
      packageName: scan.package_name,
      scanCompletedAt: scan.scan_completed_at,
      plannerInputs: {
        deleteUntagged: false,
        deleteGhostImages: undefined,
        deletePartialImages: undefined,
        deleteOrphanedImages: undefined,
        deleteTags: [],
        excludeTags,
        keepNTagged: keepCount,
        keepNUntagged: undefined,
        olderThan: options?.olderThan,
        cutoffTimestamp: options?.cutoffTimestamp
      },
      ...this.#buildPlanOutputs([], directTargetRoots, planArtifacts)
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
      deleteTagsRequested?: boolean;
      deleteGhostImages?: boolean;
      deletePartialImages?: boolean;
      deleteOrphanedImages?: boolean;
      keepNTagged?: number;
      useRegex?: boolean;
      olderThan?: string;
      cutoffTimestamp?: string;
    }
  ): DeletePlan {
    const scan = this.#getLatestCompletedScan(owner, packageName);
    const directTargetTags = this.#listDeleteTagDirectTargetTags(
      scan.scan_id,
      deleteTags,
      excludeTags,
      options?.useRegex ?? false,
      options?.cutoffTimestamp
    );
    const directTargetRoots = this.#listTaggedDirectTargetRoots(scan.scan_id, {
      deleteTags,
      deleteTagsRequested: options?.deleteTagsRequested ?? true,
      excludeTags,
      keepCount: options?.keepNTagged,
      useRegex: options?.useRegex ?? false,
      cutoffTimestamp: options?.cutoffTimestamp
    });
    const planArtifacts = this.#buildPlanArtifacts(scan.scan_id, directTargetRoots);

    return {
      owner: scan.owner,
      packageName: scan.package_name,
      scanCompletedAt: scan.scan_completed_at,
      plannerInputs: {
        deleteUntagged: false,
        deleteGhostImages: options?.deleteGhostImages || undefined,
        deletePartialImages: options?.deletePartialImages || undefined,
        deleteOrphanedImages: options?.deleteOrphanedImages || undefined,
        deleteTags,
        excludeTags,
        keepNTagged: options?.keepNTagged,
        keepNUntagged: undefined,
        olderThan: options?.olderThan,
        cutoffTimestamp: options?.cutoffTimestamp
      },
      ...this.#buildPlanOutputs(directTargetTags, directTargetRoots, planArtifacts)
    };
  }

  #buildPlanOutputs(
    directTargetTags: string[],
    directTargetRoots: DeletePlanRoot[],
    planArtifacts: _PlanArtifacts
  ): Pick<
    DeletePlan,
    | "validationSummary"
    | "directTargetTags"
    | "directTargetRoots"
    | "rootDecisions"
    | "protectedRoots"
    | "closureManifests"
    | "blockedRoots"
    | "fullyDeletableRoots"
    | "collateralTags"
  > {
    const rootDecisions = this.#buildRootDecisions(directTargetRoots, planArtifacts);
    const protectedRoots = this.#buildProtectedRoots(planArtifacts.blockedRoots);
    const deleteRootCandidateCount = directTargetRoots.filter((root) => root.selectionMode === "delete-root").length;
    const untagOnlyRootCount = directTargetRoots.length - deleteRootCandidateCount;

    return {
      validationSummary: {
        directTargetTagCount: directTargetTags.length,
        directTargetRootCount: directTargetRoots.length,
        deleteRootCandidateCount,
        untagOnlyRootCount,
        fullyDeletableRootCount: planArtifacts.fullyDeletableRoots.length,
        blockedDeleteRootCount: rootDecisions.filter((decision) => decision.validationStatus === "blocked").length,
        protectedRootCount: protectedRoots.length
      },
      directTargetTags,
      directTargetRoots,
      rootDecisions,
      protectedRoots,
      closureManifests: planArtifacts.closureManifests,
      blockedRoots: planArtifacts.blockedRoots,
      fullyDeletableRoots: planArtifacts.fullyDeletableRoots,
      collateralTags: []
    };
  }

  #buildRootDecisions(directTargetRoots: DeletePlanRoot[], planArtifacts: _PlanArtifacts): DeletePlanRootDecision[] {
    const fullyDeletableDigests = new Set(planArtifacts.fullyDeletableRoots.map((root) => root.digest));
    const blockedRootByDigest = new Map<string, DeletePlanBlockedRoot>();
    for (const blockedRoot of planArtifacts.blockedRoots) {
      if (!blockedRootByDigest.has(blockedRoot.blockedDigest)) {
        blockedRootByDigest.set(blockedRoot.blockedDigest, blockedRoot);
      }
    }

    return directTargetRoots.map((root) => {
      if (root.selectionMode === "untag-only") {
        return {
          versionId: root.versionId,
          digest: root.digest,
          manifestKind: root.manifestKind,
          selectionMode: root.selectionMode,
          selectionReason: root.reason,
          validationStatus: "untag-only",
          validationReasonCode: "untag-only-partial-tag-match",
          validationReason:
            "matched tags cover only part of this root's tag set, so the version is retained and only those tags can be detached"
        };
      }

      if (fullyDeletableDigests.has(root.digest)) {
        return {
          versionId: root.versionId,
          digest: root.digest,
          manifestKind: root.manifestKind,
          selectionMode: root.selectionMode,
          selectionReason: root.reason,
          validationStatus: "fully-deletable",
          validationReasonCode: "fully-deletable-no-retained-overlap",
          validationReason:
            "selected tags cover the whole root and its manifest closure does not overlap any retained root"
        };
      }

      const blockedRoot = blockedRootByDigest.get(root.digest);
      return {
        versionId: root.versionId,
        digest: root.digest,
        manifestKind: root.manifestKind,
        selectionMode: root.selectionMode,
        selectionReason: root.reason,
        validationStatus: "blocked",
        validationReasonCode: "blocked-overlap-with-retained-root",
        validationReason: _buildBlockedValidationReason(blockedRoot),
        blockingVersionId: blockedRoot?.blockingVersionId,
        blockingDigest: blockedRoot?.blockingDigest,
        overlapDigest: blockedRoot?.overlapDigest,
        overlapManifestKind: blockedRoot?.overlapManifestKind
      };
    });
  }

  #buildProtectedRoots(blockedRoots: DeletePlanBlockedRoot[]): DeletePlanProtectedRoot[] {
    const protectedRoots = new Map<string, DeletePlanProtectedRoot>();
    for (const blockedRoot of blockedRoots) {
      const key = `${blockedRoot.blockingVersionId}:${blockedRoot.blockingDigest}`;
      const current = protectedRoots.get(key) ?? {
        versionId: blockedRoot.blockingVersionId,
        digest: blockedRoot.blockingDigest,
        blocks: []
      };
      current.blocks.push({
        blockedVersionId: blockedRoot.blockedVersionId,
        blockedDigest: blockedRoot.blockedDigest,
        blockReasonCode: blockedRoot.reason,
        overlapDigest: blockedRoot.overlapDigest,
        overlapManifestKind: blockedRoot.overlapManifestKind
      });
      protectedRoots.set(key, current);
    }

    return [...protectedRoots.values()].sort((left, right) => left.digest.localeCompare(right.digest));
  }

  #getLatestCompletedScan(owner: string, packageName: string): _ScanRow {
    const sql = `
          SELECT scan_id, owner, package_name, scan_completed_at
          FROM v_latest_scan_per_package
          WHERE owner = ?
            AND package_name = ?
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
    useRegex: boolean,
    cutoffTimestamp?: string
  ): string[] {
    if (deleteTags.length === 0) {
      return [];
    }

    const selectedTagPredicate = this.#buildTagSelectorPredicate("t.tag", deleteTags, useRegex);
    const params: Array<number | string> = [scanId, ...selectedTagPredicate.params];
    let excludedRootSql = "";
    let olderThanSql = "";
    if (excludeTags.length > 0) {
      const excludedTagPredicate = this.#buildTagSelectorPredicate("xt.tag", excludeTags, useRegex);
      excludedRootSql = `
        AND NOT EXISTS (
          SELECT 1
          FROM tags xt
          WHERE xt.scan_id = t.scan_id
            AND xt.version_id = t.version_id
            AND (${excludedTagPredicate.sql})
        )
      `;
      params.push(...excludedTagPredicate.params);
    }
    if (cutoffTimestamp) {
      olderThanSql = "AND pv.created_at < ?";
      params.push(cutoffTimestamp);
    }

    const sql = `
          SELECT DISTINCT tag AS target_tag
          FROM tags t
          JOIN package_versions pv
            ON pv.scan_id = t.scan_id
           AND pv.version_id = t.version_id
          WHERE t.scan_id = ?
            AND (${selectedTagPredicate.sql})
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
      deleteTagsRequested?: boolean;
      excludeTags: string[];
      keepCount?: number;
      useRegex?: boolean;
      cutoffTimestamp?: string;
    }
  ): DeletePlanRoot[] {
    if (options.deleteTagsRequested && options.deleteTags.length === 0) {
      return [];
    }

    if (options.deleteTags.length === 0) {
      return this.#listKeepNTaggedDirectTargetRoots(
        scanId,
        options.excludeTags,
        options.useRegex ?? false,
        options.keepCount,
        options.cutoffTimestamp
      );
    }

    return this.#listDeleteTagMatchedDirectTargetRoots(
      scanId,
      options.deleteTags,
      options.excludeTags,
      options.useRegex ?? false,
      options.keepCount,
      options.cutoffTimestamp
    );
  }

  #listKeepNTaggedDirectTargetRoots(
    scanId: number,
    excludeTags: string[],
    useRegex: boolean,
    keepCount?: number,
    cutoffTimestamp?: string
  ): DeletePlanRoot[] {
    const excludedTagPredicate =
      excludeTags.length > 0 ? this.#buildTagSelectorPredicate("xt.tag", excludeTags, useRegex) : undefined;
    const excludedRootSql = excludedTagPredicate
      ? `
              AND NOT EXISTS (
                SELECT 1
                FROM tags xt
                WHERE xt.scan_id = pv.scan_id
                  AND xt.version_id = pv.version_id
                  AND (${excludedTagPredicate.sql})
              )
            `
      : "";
    const cutoffSql = cutoffTimestamp ? "AND pv.created_at < ?" : "";
    const keepSql = keepCount !== undefined ? "WHERE recency_rank > ?" : "";
    const params: Array<number | string> = [scanId, ...(excludedTagPredicate?.params ?? [])];
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
    useRegex: boolean,
    keepCount?: number,
    cutoffTimestamp?: string
  ): DeletePlanRoot[] {
    const selectedTagPredicate = this.#buildTagSelectorPredicate("st.tag", deleteTags, useRegex);
    const excludedTagPredicate =
      excludeTags.length > 0 ? this.#buildTagSelectorPredicate("xt.tag", excludeTags, useRegex) : undefined;
    const excludedVersionsCte = excludedTagPredicate
      ? `
          excluded_versions AS (
            SELECT DISTINCT xt.version_id
            FROM tags xt
            WHERE xt.scan_id = ?
              AND (${excludedTagPredicate.sql})
          ),
        `
      : "";
    const excludedJoinSql = excludedTagPredicate
      ? `
            LEFT JOIN excluded_versions ev
              ON ev.version_id = st.version_id
      `
      : "";
    const excludedWhereSql = excludedTagPredicate ? "AND ev.version_id IS NULL" : "";
    const cutoffSql = cutoffTimestamp ? "AND pv.created_at < ?" : "";
    const keepSql = keepCount !== undefined ? "WHERE recency_rank > ?" : "";
    const params: Array<number | string> = [scanId, ...selectedTagPredicate.params];
    if (excludedTagPredicate) {
      params.push(scanId, ...excludedTagPredicate.params);
    }
    if (cutoffTimestamp) {
      params.push(cutoffTimestamp);
    }
    params.push(scanId);
    const tailParams: Array<number> = [keepCount !== undefined ? 1 : 0];
    if (keepCount !== undefined) {
      tailParams.push(keepCount);
    }

    const sql = `
          WITH selected_tags AS (
            SELECT st.scan_id, st.version_id, st.tag
            FROM tags st
            WHERE st.scan_id = ?
              AND (${selectedTagPredicate.sql})
          ),
          ${excludedVersionsCte}
          matched_candidate_roots AS (
            SELECT DISTINCT
              st.version_id AS version_id,
              m.digest AS root_digest,
              m.manifest_kind AS root_manifest_kind,
              pv.created_at
            FROM selected_tags st
            JOIN manifests m
              ON m.scan_id = st.scan_id
             AND m.version_id = st.version_id
            JOIN package_versions pv
              ON pv.scan_id = st.scan_id
             AND pv.version_id = st.version_id
            ${excludedJoinSql}
            WHERE 1 = 1
              ${excludedWhereSql}
              ${cutoffSql}
              AND NOT EXISTS (
                SELECT 1
                FROM manifest_reachability mr
                WHERE mr.scan_id = st.scan_id
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
              COUNT(st.tag) AS matched_tag_count
            FROM matched_candidate_roots mcr
            JOIN tags t
              ON t.scan_id = ?
             AND t.version_id = mcr.version_id
            LEFT JOIN selected_tags st
              ON st.scan_id = t.scan_id
             AND st.version_id = t.version_id
             AND st.tag = t.tag
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

  #buildTagSelectorPredicate(
    columnSql: string,
    selectors: string[],
    useRegex: boolean
  ): { sql: string; params: string[] } {
    if (selectors.length === 0) {
      throw new Error("selectors must not be empty");
    }

    if (useRegex) {
      this.#registerRegexFunction();
    }

    return {
      sql: selectors
        .map((selector) => {
          if (useRegex) {
            return `regexp(?, ${columnSql})`;
          }

          return _hasWildcard(selector) ? `${columnSql} LIKE ? ESCAPE '\\'` : `${columnSql} = ?`;
        })
        .join(" OR "),
      params: useRegex
        ? selectors
        : selectors.map((selector) => (_hasWildcard(selector) ? this.#wildcardSelectorToSqlLike(selector) : selector))
    };
  }

  #wildcardSelectorToSqlLike(selector: string): string {
    return selector.replaceAll(/[%_\\*?]/g, (character) => {
      switch (character) {
        case "%":
        case "_":
        case "\\":
          return `\\${character}`;
        case "*":
          return "%";
        case "?":
          return "_";
        default:
          return character;
      }
    });
  }

  #registerRegexFunction(): void {
    const markedDatabase = this.#database as Database.Database & {
      __ghcrManagerRegexCache?: Map<string, RegExp>;
      __ghcrManagerRegexRegistered?: boolean;
    };
    if (markedDatabase.__ghcrManagerRegexRegistered) {
      return;
    }

    markedDatabase.__ghcrManagerRegexCache = new Map();
    this.#database.function("regexp", (pattern: string, value: string) => {
      let compiled = markedDatabase.__ghcrManagerRegexCache?.get(pattern);
      if (!compiled) {
        compiled = new RegExp(pattern);
        markedDatabase.__ghcrManagerRegexCache?.set(pattern, compiled);
      }

      return compiled.test(value) ? 1 : 0;
    });
    markedDatabase.__ghcrManagerRegexRegistered = true;
  }

  #buildPlanArtifacts(scanId: number, directTargetRoots: DeletePlanRoot[]): _PlanArtifacts {
    const deleteRootCandidates = this.#listDeleteRootCandidates(directTargetRoots);
    if (deleteRootCandidates.length === 0) {
      return {
        closureManifests: [],
        blockedRoots: [],
        fullyDeletableRoots: []
      };
    }

    return this.#withDirectTargetRootsTempTable(deleteRootCandidates, () => {
      const closureManifests = this.#listClosureManifests(scanId);
      const blockedRoots = this.#listBlockedRoots(scanId);
      const blockedVersionIds = new Set(blockedRoots.map((root) => root.blockedVersionId));
      const fullyDeletableRoots = deleteRootCandidates.filter((root) => !blockedVersionIds.has(root.versionId));

      return {
        closureManifests,
        blockedRoots,
        fullyDeletableRoots
      };
    });
  }

  #listClosureManifests(scanId: number): DeletePlanClosureManifest[] {
    const sql = `
          WITH direct_target_closure AS (
            SELECT
              dtr.root_version_id AS source_version_id,
              dtr.root_digest AS source_digest,
              dtr.root_version_id AS member_version_id,
              dtr.root_digest AS member_digest,
              dtr.root_manifest_kind AS member_manifest_kind,
              0 AS hops_from_root,
              'root' AS member_role
            FROM temp_direct_target_roots dtr

            UNION ALL

            SELECT
              dtr.root_version_id AS source_version_id,
              dtr.root_digest AS source_digest,
              m.version_id AS member_version_id,
              m.digest AS member_digest,
              m.manifest_kind AS member_manifest_kind,
              mr.min_distance AS hops_from_root,
              'descendant' AS member_role
            FROM temp_direct_target_roots dtr
            JOIN manifest_reachability mr
              ON mr.scan_id = ?
             AND mr.ancestor_digest = dtr.root_digest
             AND mr.min_distance > 0
            JOIN manifests m
              ON m.scan_id = ?
             AND m.digest = mr.descendant_digest
          )
          SELECT
            source_version_id,
            source_digest,
            member_version_id,
            member_digest,
            member_manifest_kind,
            hops_from_root,
            member_role
          FROM direct_target_closure
          ORDER BY source_digest, hops_from_root, member_digest
        `;
    const rows = this.#all<_ClosureManifestRow>(sql, [scanId, scanId]);

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

  #listBlockedRoots(scanId: number): DeletePlanBlockedRoot[] {
    const sql = `
          WITH retained_roots AS (
            SELECT
              m.version_id AS root_version_id,
              m.digest AS root_digest
            FROM manifests m
            WHERE m.scan_id = ?
              AND NOT EXISTS (
                SELECT 1
                FROM manifest_reachability mr
                WHERE mr.scan_id = m.scan_id
                  AND mr.descendant_digest = m.digest
                  AND mr.min_distance > 0
              )
              AND NOT EXISTS (
                SELECT 1
                FROM temp_direct_target_roots dtr
                WHERE dtr.root_digest = m.digest
              )
          ),
          direct_target_closure AS (
            SELECT
              dtr.root_version_id AS root_version_id,
              dtr.root_digest AS root_digest,
              dtr.root_manifest_kind AS member_manifest_kind,
              dtr.root_digest AS member_digest,
              0 AS hops_from_root
            FROM temp_direct_target_roots dtr

            UNION ALL

            SELECT
              dtr.root_version_id AS root_version_id,
              dtr.root_digest AS root_digest,
              m.manifest_kind AS member_manifest_kind,
              m.digest AS member_digest,
              mr.min_distance AS hops_from_root
            FROM temp_direct_target_roots dtr
            JOIN manifest_reachability mr
              ON mr.scan_id = ?
             AND mr.ancestor_digest = dtr.root_digest
             AND mr.min_distance > 0
            JOIN manifests m
              ON m.scan_id = ?
             AND m.digest = mr.descendant_digest
          ),
          ranked_blocks AS (
            SELECT
              dtc.root_version_id AS blocked_version_id,
              dtc.root_digest AS blocked_digest,
              rr.root_version_id AS blocking_version_id,
              rr.root_digest AS blocking_digest,
              dtc.member_digest AS overlap_digest,
              dtc.member_manifest_kind AS overlap_manifest_kind,
              'overlap-with-retained-root' AS block_reason,
              ROW_NUMBER() OVER (
                PARTITION BY dtc.root_digest, rr.root_digest
                ORDER BY
                  dtc.hops_from_root,
                  retained_overlap.min_distance,
                  dtc.member_digest
              ) AS rn
            FROM direct_target_closure dtc
            JOIN retained_roots rr
              ON rr.root_digest <> dtc.root_digest
            JOIN manifest_reachability retained_overlap
              ON retained_overlap.scan_id = ?
             AND retained_overlap.ancestor_digest = rr.root_digest
             AND retained_overlap.descendant_digest = dtc.member_digest
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
    const rows = this.#all<_BlockedRootRow>(sql, [scanId, scanId, scanId, scanId]);

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

  #withDirectTargetRootsTempTable<T>(directTargetRoots: DeletePlanRoot[], callback: () => T): T {
    this.#exec(`
      CREATE TEMP TABLE IF NOT EXISTS temp_direct_target_roots (
        root_version_id INTEGER NOT NULL,
        root_digest TEXT NOT NULL,
        root_manifest_kind TEXT,
        direct_target_reason TEXT NOT NULL,
        selection_mode TEXT NOT NULL
      )
    `);
    this.#exec(`
      CREATE INDEX IF NOT EXISTS idx_temp_direct_target_roots_digest
        ON temp_direct_target_roots(root_digest)
    `);
    this.#exec(`
      CREATE INDEX IF NOT EXISTS idx_temp_direct_target_roots_version_digest
        ON temp_direct_target_roots(root_version_id, root_digest)
    `);
    this.#exec("DELETE FROM temp_direct_target_roots");
    this.#insertDirectTargetRoots(directTargetRoots);

    try {
      return callback();
    } finally {
      this.#exec("DELETE FROM temp_direct_target_roots");
    }
  }

  #insertDirectTargetRoots(directTargetRoots: DeletePlanRoot[]): void {
    const insertSql = `
      INSERT INTO temp_direct_target_roots (
        root_version_id,
        root_digest,
        root_manifest_kind,
        direct_target_reason,
        selection_mode
      ) VALUES (?, ?, ?, ?, ?)
    `;
    this.#traceSql(insertSql, ["<chunked rows omitted>"]);
    const insert = this.#database.prepare(insertSql);
    const insertMany = this.#database.transaction((roots: DeletePlanRoot[]) => {
      for (const root of roots) {
        insert.run(root.versionId, root.digest, root.manifestKind ?? null, root.reason, root.selectionMode);
      }
    });

    const chunkSize = 1000;
    for (let index = 0; index < directTargetRoots.length; index += chunkSize) {
      const chunk = directTargetRoots.slice(index, index + chunkSize);
      insertMany(chunk);
      this.#logger.debug(`Inserted ${chunk.length} direct target root row(s) into temp_direct_target_roots`);
    }
  }

  #listDeleteRootCandidates(directTargetRoots: DeletePlanRoot[]): DeletePlanRoot[] {
    return directTargetRoots.filter((root) => root.selectionMode === "delete-root");
  }

  #exec(sql: string, params: Array<number | string | null> = []): void {
    this.#traceSql(sql, params);
    this.#database.prepare(sql).run(...params);
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

  #traceSql(sql: string, params: Array<number | string | null>): void {
    this.#logger.trace(`SQL:\n${sql.trim()}\nPARAMS: ${JSON.stringify(params)}`);
  }
}

const _silentPlannerLogger: _PlannerLogger = {
  trace() {},
  debug() {}
};

function _buildBlockedValidationReason(blockedRoot?: DeletePlanBlockedRoot): string {
  if (!blockedRoot) {
    return "root closure overlaps manifest members still required by a retained root";
  }

  return `blocked because retained root ${blockedRoot.blockingDigest} still requires shared manifest ${blockedRoot.overlapDigest}`;
}

function _hasWildcard(selector: string): boolean {
  return selector.includes("*") || selector.includes("?");
}
