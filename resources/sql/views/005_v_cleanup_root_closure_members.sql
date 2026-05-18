DROP VIEW IF EXISTS v_cleanup_root_closure_members;

CREATE VIEW v_cleanup_root_closure_members AS
WITH selected_roots AS (
  SELECT
    run.cleanup_run_id,
    run.scan_id,
    ps.owner,
    ps.package_name,
    decision.digest AS root_digest,
    root_manifest.version_id AS root_version_id,
    root_manifest.manifest_kind AS root_manifest_kind,
    decision.selection_mode,
    decision.selection_reason,
    decision.validation_status,
    decision.validation_reason_code,
    decision.validation_reason
  FROM cleanup_root_decisions decision
  JOIN cleanup_runs run
    ON run.cleanup_run_id = decision.cleanup_run_id
   AND run.scan_id = decision.scan_id
  JOIN package_scans ps
    ON ps.scan_id = run.scan_id
  JOIN manifests root_manifest
    ON root_manifest.scan_id = decision.scan_id
   AND root_manifest.digest = decision.digest
),
closure_members AS (
  SELECT
    sr.cleanup_run_id,
    sr.scan_id,
    sr.owner,
    sr.package_name,
    sr.root_digest,
    sr.root_version_id,
    sr.root_manifest_kind,
    sr.selection_mode,
    sr.selection_reason,
    sr.validation_status,
    sr.validation_reason_code,
    sr.validation_reason,
    sr.root_digest AS member_digest,
    sr.root_version_id AS member_version_id,
    sr.root_manifest_kind AS member_manifest_kind,
    0 AS hops_from_root,
    'root' AS member_role
  FROM selected_roots sr

  UNION ALL

  SELECT
    sr.cleanup_run_id,
    sr.scan_id,
    sr.owner,
    sr.package_name,
    sr.root_digest,
    sr.root_version_id,
    sr.root_manifest_kind,
    sr.selection_mode,
    sr.selection_reason,
    sr.validation_status,
    sr.validation_reason_code,
    sr.validation_reason,
    member_manifest.digest AS member_digest,
    member_manifest.version_id AS member_version_id,
    member_manifest.manifest_kind AS member_manifest_kind,
    reachability.min_distance AS hops_from_root,
    'descendant' AS member_role
  FROM selected_roots sr
  JOIN manifest_reachability reachability
    ON reachability.scan_id = sr.scan_id
   AND reachability.ancestor_digest = sr.root_digest
   AND reachability.min_distance > 0
  JOIN manifests member_manifest
    ON member_manifest.scan_id = sr.scan_id
   AND member_manifest.digest = reachability.descendant_digest
)
SELECT
  cm.cleanup_run_id,
  cm.scan_id,
  cm.owner,
  cm.package_name,
  cm.root_digest,
  cm.root_version_id,
  cm.root_manifest_kind,
  cm.selection_mode,
  cm.selection_reason,
  cm.validation_status,
  cm.validation_reason_code,
  cm.validation_reason,
  cm.member_digest,
  cm.member_version_id,
  cm.member_manifest_kind,
  cm.hops_from_root,
  cm.member_role,
  tag.tag AS member_tag
FROM closure_members cm
LEFT JOIN tags tag
  ON tag.scan_id = cm.scan_id
 AND tag.version_id = cm.member_version_id;
