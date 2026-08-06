import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { resolveGitHubActionsRunUrl } from './_github-actions-run-url.js'
import { DeletePlanValidationStatuses, type DeletePlan } from './planner/index.js'

export class CleanupRunWriter {
  readonly #database: Database.Database
  readonly #insertSelectedTagStatement: Database.Statement
  readonly #updateSelectedTagsDeletedStatement: Database.Statement
  readonly #insertRootDecisionStatement: Database.Statement
  readonly #insertProtectedRootBlockStatement: Database.Statement
  readonly #insertCleanupRunStatement: Database.Statement

  constructor (database: Database.Database) {
    this.#database = database
    this.#insertSelectedTagStatement = this.#database.prepare(`
      INSERT INTO cleanup_selected_tags(
        cleanup_run_id,
        scan_id,
        tag,
        is_deleted
      )
      VALUES(?, ?, ?, 0)
    `)
    this.#updateSelectedTagsDeletedStatement = this.#database.prepare(`
      UPDATE cleanup_selected_tags
      SET is_deleted = 1
      FROM cleanup_root_decisions decision
      JOIN manifests manifest
        ON manifest.scan_id = decision.scan_id
       AND manifest.digest = decision.digest
      JOIN tags
        ON tags.scan_id = manifest.scan_id
       AND tags.version_id = manifest.version_id
      WHERE cleanup_selected_tags.cleanup_run_id = ?
        AND cleanup_selected_tags.scan_id = ?
        AND decision.cleanup_run_id = cleanup_selected_tags.cleanup_run_id
        AND decision.scan_id = cleanup_selected_tags.scan_id
        AND decision.validation_status != 'blocked'
        AND tags.tag = cleanup_selected_tags.tag
    `)
    this.#insertRootDecisionStatement = this.#database.prepare(`
      INSERT INTO cleanup_root_decisions(
        cleanup_run_id,
        scan_id,
        digest,
        selection_mode,
        selection_reason,
        validation_status,
        validation_reason_code,
        validation_reason,
        blocking_digest,
        overlap_digest
      )
      VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    this.#insertProtectedRootBlockStatement = this.#database.prepare(`
      INSERT INTO cleanup_protected_root_blocks(
        cleanup_run_id,
        scan_id,
        protected_digest,
        blocked_digest,
        block_reason_code,
        overlap_digest
      )
      VALUES(?, ?, ?, ?, ?, ?)
    `)
    this.#insertCleanupRunStatement = this.#database.prepare(`
      INSERT INTO cleanup_runs(
        scan_id,
        cleanup_uuid,
        cleanup_started_at,
        github_actions_run_url,
        dry_run,
        planner_inputs_json,
        direct_target_tag_count,
        direct_target_root_count,
        delete_root_candidate_count,
        untag_only_root_count,
        fully_deletable_root_count,
        blocked_delete_root_count,
        protected_root_count
      )
      VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
  }

  persistCleanupRun (scanId: number, plan: DeletePlan, options: { dryRun: boolean, cleanupStartedAt: string }): number {
    return this.#database.transaction(() => {
      const cleanupRunId = this.#insertCleanupRun(scanId, plan, options)
      for (const rootDecision of plan.rootDecisions) {
        this.#insertRootDecisionStatement.run(
          cleanupRunId,
          scanId,
          rootDecision.digest,
          rootDecision.selectionMode,
          rootDecision.selectionReason,
          rootDecision.validationStatus,
          rootDecision.validationReasonCode,
          rootDecision.validationReason,
          rootDecision.blockingDigest ?? null,
          rootDecision.overlapDigest ?? null
        )
      }

      for (const protectedRoot of plan.protectedRoots) {
        for (const block of protectedRoot.blocks) {
          this.#insertProtectedRootBlockStatement.run(
            cleanupRunId,
            scanId,
            protectedRoot.digest,
            block.blockedDigest,
            block.blockReasonCode,
            block.overlapDigest
          )
        }
      }

      for (const tag of plan.directTargetTags) {
        this.#insertSelectedTagStatement.run(cleanupRunId, scanId, tag)
      }
      this.#updateSelectedTagsDeletedStatement.run(cleanupRunId, scanId)

      return cleanupRunId
    })()
  }

  #insertCleanupRun (scanId: number, plan: DeletePlan, options: { dryRun: boolean, cleanupStartedAt: string }): number {
    const directTargetTagCount = plan.directTargetTags.length
    const directTargetRootCount = plan.directTargetRoots.length
    const deleteRootCandidateCount = plan.directTargetRoots.filter(
      (root) => root.selectionMode === 'delete-root'
    ).length
    const untagOnlyRootCount = plan.rootDecisions.filter(
      (decision) => decision.validationStatus === DeletePlanValidationStatuses.untagOnly
    ).length
    const fullyDeletableRootCount = plan.fullyDeletableRoots.length
    const blockedDeleteRootCount = plan.rootDecisions.filter(
      (decision) => decision.validationStatus === DeletePlanValidationStatuses.blocked
    ).length
    const protectedRootCount = plan.protectedRoots.length
    const result = this.#insertCleanupRunStatement.run(
      scanId,
      randomUUID(),
      options.cleanupStartedAt,
      resolveGitHubActionsRunUrl(),
      options.dryRun ? 1 : 0,
      JSON.stringify(plan.plannerInputs),
      directTargetTagCount,
      directTargetRootCount,
      deleteRootCandidateCount,
      untagOnlyRootCount,
      fullyDeletableRootCount,
      blockedDeleteRootCount,
      protectedRootCount
    )

    return Number(result.lastInsertRowid)
  }
}
