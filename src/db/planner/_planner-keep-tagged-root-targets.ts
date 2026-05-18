import { buildTagSelectorPredicate } from "./_planner-tag-selectors.js";
import { PlannerSql } from "./_planner-sql.js";
import { mapPlanRootRow, type DeletePlanRoot } from "./_planner-types.js";

export class PlannerKeepTaggedRootTargets {
  readonly #sql: PlannerSql;

  constructor(sql: PlannerSql) {
    this.#sql = sql;
  }

  list(
    scanId: number,
    excludeTags: string[],
    useRegex: boolean,
    keepCount?: number,
    cutoffTimestamp?: string
  ): DeletePlanRoot[] {
    const excludedTagPredicate =
      excludeTags.length > 0
        ? buildTagSelectorPredicate(this.#sql.database, "xt.tag", excludeTags, useRegex)
        : undefined;
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
    return this.#sql.all<Parameters<typeof mapPlanRootRow>[0]>(sql, params).map(mapPlanRootRow);
  }
}
