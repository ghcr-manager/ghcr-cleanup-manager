import { buildTagSelectorPredicate } from "./_planner-tag-selectors.js";
import { PlannerSql } from "./_planner-sql.js";
import { mapPlanRootRow, type DeletePlanRoot } from "./_planner-types.js";

export class PlannerDeleteTagRootTargets {
  readonly #sql: PlannerSql;

  constructor(sql: PlannerSql) {
    this.#sql = sql;
  }

  list(
    scanId: number,
    deleteTags: string[],
    excludeTags: string[],
    useRegex: boolean,
    keepCount?: number,
    cutoffTimestamp?: string
  ): DeletePlanRoot[] {
    const selectedTagPredicate = buildTagSelectorPredicate(this.#sql.database, "st.tag", deleteTags, useRegex);
    const excludedTagPredicate =
      excludeTags.length > 0
        ? buildTagSelectorPredicate(this.#sql.database, "xt.tag", excludeTags, useRegex)
        : undefined;
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
    return this.#sql.all<Parameters<typeof mapPlanRootRow>[0]>(sql, [...params, ...tailParams]).map(mapPlanRootRow);
  }
}
