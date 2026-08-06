export interface SourceScanRow {
  scan_id: number
  scan_uuid: string
  owner: string
  package_name: string
  package_metadata_json: string | null
  github_actions_run_url: string | null
  scan_started_at: string
  scan_completed_at: string | null
  status: string
}

export interface TargetScanRow {
  scan_id: number
  scan_uuid: string
  owner: string
  package_name: string
  package_metadata_json: string | null
  github_actions_run_url: string | null
  scan_started_at: string
  scan_completed_at: string | null
  status: string
}

export interface CleanupRunRow {
  cleanup_run_id: number
  cleanup_uuid: string
  cleanup_started_at: string
  github_actions_run_url: string | null
  dry_run: number
  planner_inputs_json: string
  direct_target_tag_count: number
  direct_target_root_count: number
  delete_root_candidate_count: number
  untag_only_root_count: number
  fully_deletable_root_count: number
  blocked_delete_root_count: number
  protected_root_count: number
}

export interface DbMergeSourceSummary {
  sourceDatabasePath: string
  importedScanCount: number
  skippedScanCount: number
  importedCleanupRunCount: number
  skippedCleanupRunCount: number
}
