import Database from 'better-sqlite3'
import { initializeSchema } from './_schema.js'

export { ScanWriter } from './_scan-writer.js'
export { CleanupRunWriter } from './_cleanup-run-writer.js'
export { DbMergeRepository } from './_db-merge-repository.js'
export { PlannerRepository } from './planner/index.js'
export { SnapshotRepository } from './_snapshot-repository.js'
export type {
  DeletePlan,
  DeletePlanBlockReasonCode,
  DeletePlanSelectionMode,
  DeletePlanSelectionReason,
  DeletePlanValidationReasonCode,
  DeletePlanValidationStatus
} from './planner/index.js'
export { DeletePlanValidationReasonCodes, DeletePlanValidationStatuses } from './planner/index.js'
export type { DbMergeSourceSummary } from './_db-merge-repository.js'

export function openDatabase (databasePath: string): Database.Database {
  const database = new Database(databasePath)
  initializeSchema(database)
  return database
}
