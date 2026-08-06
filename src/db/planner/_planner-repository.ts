import type Database from 'better-sqlite3'
import { PlannerDirectTargetRoots } from './_planner-direct-target-roots.js'
import { PlannerDirectTargetTags } from './_planner-direct-target-tags.js'
import { PlannerLatestScan } from './_planner-latest-scan.js'
import { buildPlanOutputs } from './_planner-output.js'
import { PlannerPlanArtifacts } from './_planner-plan-artifacts.js'
import { PlannerSql } from './_planner-sql.js'
import type { DeletePlan, PlannerLogger } from './_planner-types.js'

export type {
  DeletePlan,
  DeletePlanBlockReasonCode,
  DeletePlanBlockedRoot,
  DeletePlanClosureManifest,
  DeletePlanProtectedRoot,
  DeletePlanRoot,
  DeletePlanRootDecision,
  DeletePlanSelectionMode,
  DeletePlanSelectionReason,
  DeletePlanValidationReasonCode,
  DeletePlanValidationStatus
} from './_planner-types.js'
export { DeletePlanValidationReasonCodes, DeletePlanValidationStatuses } from './_planner-types.js'

export class PlannerRepository {
  readonly #latestScan: PlannerLatestScan
  readonly #directTargetTags: PlannerDirectTargetTags
  readonly #directTargetRoots: PlannerDirectTargetRoots
  readonly #planArtifacts: PlannerPlanArtifacts

  constructor (database: Database.Database, logger?: PlannerLogger) {
    const sql = new PlannerSql(database, logger)
    this.#latestScan = new PlannerLatestScan(sql)
    this.#directTargetTags = new PlannerDirectTargetTags(sql)
    this.#directTargetRoots = new PlannerDirectTargetRoots(sql)
    this.#planArtifacts = new PlannerPlanArtifacts(sql)
  }

  getDeleteUntaggedPlan (owner: string, packageName: string): DeletePlan {
    return this.getDeleteUntaggedPlanWithCutoff(owner, packageName)
  }

  getLatestCompletedScanId (owner: string, packageName: string): number {
    return this.#latestScan.get(owner, packageName).scan_id
  }

  getKeepNUntaggedPlan (owner: string, packageName: string, keepCount: number): DeletePlan {
    return this.getKeepNUntaggedPlanWithCutoff(owner, packageName, keepCount)
  }

  getDeleteUntaggedPlanWithCutoff (
    owner: string,
    packageName: string,
    options?: {
      olderThan?: string
      cutoffTimestamp?: string
    }
  ): DeletePlan {
    return this.getCleanupPlanWithCutoff(owner, packageName, {
      deleteUntagged: true,
      olderThan: options?.olderThan,
      cutoffTimestamp: options?.cutoffTimestamp
    })
  }

  getKeepNUntaggedPlanWithCutoff (
    owner: string,
    packageName: string,
    keepCount: number,
    options?: {
      olderThan?: string
      cutoffTimestamp?: string
    }
  ): DeletePlan {
    return this.getCleanupPlanWithCutoff(owner, packageName, {
      keepNUntagged: keepCount,
      olderThan: options?.olderThan,
      cutoffTimestamp: options?.cutoffTimestamp
    })
  }

  getDeleteTagsPlan (owner: string, packageName: string, deleteTags: string[], excludeTags: string[]): DeletePlan {
    return this.getDeleteTagsPlanWithCutoff(owner, packageName, deleteTags, excludeTags)
  }

  getDeleteTagsPlanWithCutoff (
    owner: string,
    packageName: string,
    deleteTags: string[],
    excludeTags: string[],
    options?: {
      deleteTagsRequested?: boolean
      deleteGhostImages?: boolean
      deletePartialImages?: boolean
      deleteOrphanedImages?: boolean
      keepNTagged?: number
      useRegex?: boolean
      olderThan?: string
      cutoffTimestamp?: string
    }
  ): DeletePlan {
    return this.getCleanupPlanWithCutoff(owner, packageName, {
      deleteTags,
      excludeTags,
      deleteGhostImages: options?.deleteGhostImages,
      deletePartialImages: options?.deletePartialImages,
      deleteOrphanedImages: options?.deleteOrphanedImages,
      deleteTagsRequested: options?.deleteTagsRequested ?? true,
      keepNTagged: options?.keepNTagged,
      useRegex: options?.useRegex,
      olderThan: options?.olderThan,
      cutoffTimestamp: options?.cutoffTimestamp
    })
  }

  getCleanupPlanWithCutoff (
    owner: string,
    packageName: string,
    options?: {
      deleteUntagged?: boolean
      deleteGhostImages?: boolean
      deletePartialImages?: boolean
      deleteOrphanedImages?: boolean
      deleteTags?: string[]
      deleteTagsRequested?: boolean
      excludeTags?: string[]
      keepNTagged?: number
      keepNUntagged?: number
      useRegex?: boolean
      olderThan?: string
      cutoffTimestamp?: string
    }
  ): DeletePlan {
    const scan = this.#latestScan.get(owner, packageName)
    const deleteTags = options?.deleteTags ?? []
    const excludeTags = options?.excludeTags ?? []
    const directTargetTags = this.#directTargetTags.listDeleteTagDirectTargetTags(
      scan.scan_id,
      deleteTags,
      excludeTags,
      options?.useRegex ?? false,
      options?.deleteOrphanedImages ?? false,
      options?.cutoffTimestamp
    )
    const directTargetRoots = this.#directTargetRoots.list(scan.scan_id, {
      deleteTags,
      deleteTagsRequested: options?.deleteTagsRequested ?? false,
      deleteOrphanedImages: options?.deleteOrphanedImages ?? false,
      excludeTags,
      deleteUntagged: options?.deleteUntagged ?? false,
      keepNTagged: options?.keepNTagged,
      keepNUntagged: options?.keepNUntagged,
      useRegex: options?.useRegex ?? false,
      cutoffTimestamp: options?.cutoffTimestamp
    })
    const planArtifacts = this.#planArtifacts.build(scan.scan_id, directTargetRoots)

    return {
      owner: scan.owner,
      packageName: scan.package_name,
      scanCompletedAt: scan.scan_completed_at,
      plannerInputs: _buildPlannerInputs({
        deleteGhostImages: options?.deleteGhostImages || undefined,
        deletePartialImages: options?.deletePartialImages || undefined,
        deleteOrphanedImages: options?.deleteOrphanedImages || undefined,
        deleteTags,
        deleteUntagged: options?.deleteUntagged || undefined,
        excludeTags,
        keepNTagged: options?.keepNTagged,
        keepNUntagged: options?.keepNUntagged,
        useRegex: options?.useRegex || undefined,
        olderThan: options?.olderThan,
        cutoffTimestamp: options?.cutoffTimestamp
      }),
      ...buildPlanOutputs(directTargetTags, directTargetRoots, planArtifacts)
    }
  }
}

function _buildPlannerInputs (inputs: DeletePlan['plannerInputs']): DeletePlan['plannerInputs'] {
  return Object.fromEntries(
    Object.entries(inputs).filter(([, value]) => {
      if (value === undefined) {
        return false
      }
      return !(Array.isArray(value) && value.length === 0)
    })
  ) as DeletePlan['plannerInputs']
}
