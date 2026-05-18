DROP VIEW IF EXISTS v_cleanup_blocking_overlaps;

CREATE VIEW v_cleanup_blocking_overlaps AS
SELECT
  run.cleanup_run_id,
  run.scan_id,
  ps.owner,
  ps.package_name,
  block.protected_digest,
  protected_manifest.version_id AS protected_version_id,
  protected_manifest.manifest_kind AS protected_manifest_kind,
  block.blocked_digest,
  blocked_manifest.version_id AS blocked_version_id,
  blocked_manifest.manifest_kind AS blocked_manifest_kind,
  decision.selection_mode AS blocked_selection_mode,
  decision.selection_reason AS blocked_selection_reason,
  decision.validation_status AS blocked_validation_status,
  decision.validation_reason_code AS blocked_validation_reason_code,
  decision.validation_reason AS blocked_validation_reason,
  block.block_reason_code,
  block.overlap_digest,
  overlap_manifest.version_id AS overlap_version_id,
  overlap_manifest.manifest_kind AS overlap_manifest_kind
FROM cleanup_protected_root_blocks block
JOIN cleanup_runs run
  ON run.cleanup_run_id = block.cleanup_run_id
 AND run.scan_id = block.scan_id
JOIN package_scans ps
  ON ps.scan_id = run.scan_id
JOIN manifests protected_manifest
  ON protected_manifest.scan_id = block.scan_id
 AND protected_manifest.digest = block.protected_digest
JOIN manifests blocked_manifest
  ON blocked_manifest.scan_id = block.scan_id
 AND blocked_manifest.digest = block.blocked_digest
JOIN cleanup_root_decisions decision
  ON decision.cleanup_run_id = block.cleanup_run_id
 AND decision.scan_id = block.scan_id
 AND decision.digest = block.blocked_digest
LEFT JOIN manifests overlap_manifest
  ON overlap_manifest.scan_id = block.scan_id
 AND overlap_manifest.digest = block.overlap_digest;
