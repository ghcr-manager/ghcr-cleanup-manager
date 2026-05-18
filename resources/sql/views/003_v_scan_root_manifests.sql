DROP VIEW IF EXISTS v_scan_root_manifests;

CREATE VIEW v_scan_root_manifests AS
SELECT
  ps.scan_id,
  ps.owner,
  ps.package_name,
  m.version_id AS root_version_id,
  m.digest AS root_digest,
  m.manifest_kind AS root_manifest_kind,
  pv.created_at,
  pv.updated_at,
  COUNT(t.tag) AS tag_count,
  CASE WHEN COUNT(t.tag) > 0 THEN 1 ELSE 0 END AS is_tagged,
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM manifest_reachability mr
      WHERE mr.scan_id = m.scan_id
        AND mr.descendant_digest = m.digest
        AND mr.min_distance > 0
    ) THEN 1
    ELSE 0
  END AS has_ancestor
FROM manifests m
JOIN package_versions pv
  ON pv.scan_id = m.scan_id
 AND pv.version_id = m.version_id
JOIN package_scans ps
  ON ps.scan_id = m.scan_id
LEFT JOIN tags t
  ON t.scan_id = m.scan_id
 AND t.version_id = m.version_id
GROUP BY
  ps.scan_id,
  ps.owner,
  ps.package_name,
  m.version_id,
  m.digest,
  m.manifest_kind,
  pv.created_at,
  pv.updated_at
;
