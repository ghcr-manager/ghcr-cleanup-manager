import { buildTagSelectorPredicate } from "./_planner-tag-selectors.js";
import type { DirectTargetRootOptions } from "./_planner-direct-target-root-options.js";
import type { PlannerSql } from "./_planner-sql.js";

export interface DirectTargetRootTagFilters {
  selectedTagsSql: string;
  selectedParams: Array<number | string>;
  excludedTagsSql: string;
  excludedParams: Array<number | string>;
}

export function buildDirectTargetRootTagFilters(
  sql: PlannerSql,
  scanId: number,
  options: DirectTargetRootOptions
): DirectTargetRootTagFilters {
  const selectedTagPredicate =
    options.deleteTags.length > 0
      ? buildTagSelectorPredicate(sql.database, "t.tag", options.deleteTags, options.useRegex ?? false)
      : undefined;
  const excludedTagPredicate =
    options.excludeTags.length > 0
      ? buildTagSelectorPredicate(sql.database, "xt.tag", options.excludeTags, options.useRegex ?? false)
      : undefined;

  const selectedTagDigestFlag = options.deleteOrphanedImages ? 1 : 0;
  const selectedTagsSql = selectedTagPredicate
    ? `
        SELECT DISTINCT t.version_id, t.tag
        FROM tags t
        WHERE t.scan_id = ?
          AND t.is_digest_tag = ?
          AND (${selectedTagPredicate.sql})
          ${
            excludedTagPredicate
              ? `
          AND NOT EXISTS (
            SELECT 1
            FROM tags xt
            WHERE xt.scan_id = t.scan_id
              AND xt.version_id = t.version_id
              AND xt.tag = t.tag
              AND (${excludedTagPredicate.sql})
          )
        `
              : ""
          }
      `
    : `
        SELECT NULL AS version_id, NULL AS tag
        WHERE 1 = 0
      `;
  const selectedParams = selectedTagPredicate
    ? [scanId, selectedTagDigestFlag, ...selectedTagPredicate.params, ...(excludedTagPredicate?.params ?? [])]
    : [];
  const excludedTagsSql = excludedTagPredicate
    ? `
        SELECT DISTINCT xt.version_id, xt.tag
        FROM tags xt
        WHERE xt.scan_id = ?
          AND xt.is_digest_tag = 0
          AND (${excludedTagPredicate.sql})
      `
    : `
        SELECT NULL AS version_id, NULL AS tag
        WHERE 1 = 0
      `;
  const excludedParams = excludedTagPredicate ? [scanId, ...excludedTagPredicate.params] : [];

  return {
    selectedTagsSql,
    selectedParams,
    excludedTagsSql,
    excludedParams
  };
}
