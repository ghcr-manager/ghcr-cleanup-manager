import { PlannerDeleteTagRootTargets } from "./_planner-delete-tag-root-targets.js";
import { PlannerKeepTaggedRootTargets } from "./_planner-keep-tagged-root-targets.js";
import { PlannerSql } from "./_planner-sql.js";
import type { DeletePlanRoot } from "./_planner-types.js";

export interface TaggedRootTargetOptions {
  deleteTags: string[];
  deleteTagsRequested?: boolean;
  excludeTags: string[];
  keepCount?: number;
  useRegex?: boolean;
  cutoffTimestamp?: string;
}

export class PlannerTaggedRootTargets {
  readonly #deleteTagTargets: PlannerDeleteTagRootTargets;
  readonly #keepTaggedTargets: PlannerKeepTaggedRootTargets;

  constructor(sql: PlannerSql) {
    this.#deleteTagTargets = new PlannerDeleteTagRootTargets(sql);
    this.#keepTaggedTargets = new PlannerKeepTaggedRootTargets(sql);
  }

  listTaggedDirectTargetRoots(scanId: number, options: TaggedRootTargetOptions): DeletePlanRoot[] {
    if (options.deleteTagsRequested && options.deleteTags.length === 0) {
      return [];
    }

    if (options.deleteTags.length === 0) {
      return this.#keepTaggedTargets.list(
        scanId,
        options.excludeTags,
        options.useRegex ?? false,
        options.keepCount,
        options.cutoffTimestamp
      );
    }

    return this.#deleteTagTargets.list(
      scanId,
      options.deleteTags,
      options.excludeTags,
      options.useRegex ?? false,
      options.keepCount,
      options.cutoffTimestamp
    );
  }
}
