DROP VIEW IF EXISTS v_missing_digests_related_manifests;

CREATE VIEW v_missing_digests_related_manifests AS
WITH latest_scan_per_package AS (
  SELECT scan_id
  FROM (
    SELECT
      ps.scan_id,
      ROW_NUMBER() OVER (
        PARTITION BY ps.owner, ps.package_name
        ORDER BY ps.scan_completed_at DESC
      ) AS rn
    FROM package_scans ps
    WHERE ps.scan_completed_at IS NOT NULL
      AND ps.status = 'completed'
  )
  WHERE rn = 1
),
missing_refs AS (
  SELECT DISTINCT
    lsp.scan_id,
    d.child_digest AS missing_digest,
    d.parent_digest AS anchor_digest
  FROM manifest_descriptors d
  JOIN latest_scan_per_package lsp ON lsp.scan_id = d.scan_id
  LEFT JOIN manifests m
    ON m.scan_id = d.scan_id
   AND m.digest = d.child_digest
  WHERE m.digest IS NULL

  UNION

  SELECT DISTINCT
    lsp.scan_id,
    mf.subject_digest AS missing_digest,
    mf.digest AS anchor_digest
  FROM manifests mf
  JOIN latest_scan_per_package lsp ON lsp.scan_id = mf.scan_id
  LEFT JOIN manifests m
    ON m.scan_id = mf.scan_id
   AND m.digest = mf.subject_digest
  WHERE mf.subject_digest IS NOT NULL
    AND m.digest IS NULL
),
related_manifests AS (
  SELECT DISTINCT
    m.scan_id,
    mr.missing_digest,
    m.digest AS related_manifest_digest,
    m.media_type,
    1 AS hops_missing_to_related_manifest
  FROM missing_refs mr
  JOIN latest_scan_per_package lsp
    ON lsp.scan_id = mr.scan_id
  JOIN manifests m
    ON m.scan_id = lsp.scan_id
   AND m.digest = mr.anchor_digest

  UNION

  SELECT DISTINCT
    m.scan_id,
    mr.missing_digest,
    m.digest AS related_manifest_digest,
    m.media_type,
    r.min_distance + 1 AS hops_missing_to_related_manifest
  FROM missing_refs mr
  JOIN latest_scan_per_package lsp
    ON lsp.scan_id = mr.scan_id
  JOIN manifests m
    ON m.scan_id = lsp.scan_id
  JOIN manifest_reachability r
    ON r.scan_id = m.scan_id
   AND r.ancestor_digest = m.digest
   AND r.descendant_digest = mr.anchor_digest

  UNION

  SELECT DISTINCT
    m.scan_id,
    mr.missing_digest,
    m.digest AS related_manifest_digest,
    m.media_type,
    r.min_distance + 1 AS hops_missing_to_related_manifest
  FROM missing_refs mr
  JOIN latest_scan_per_package lsp
    ON lsp.scan_id = mr.scan_id
  JOIN manifests m
    ON m.scan_id = lsp.scan_id
  JOIN manifest_reachability r
    ON r.scan_id = m.scan_id
   AND r.ancestor_digest = mr.anchor_digest
   AND r.descendant_digest = m.digest
),
closest_related_manifests AS (
  SELECT
    scan_id,
    missing_digest,
    related_manifest_digest,
    media_type,
    MIN(hops_missing_to_related_manifest) AS hops_missing_to_related_manifest
  FROM related_manifests
  GROUP BY
    missing_digest,
    scan_id,
    related_manifest_digest,
    media_type
)
SELECT
  ps.scan_id,
  ps.owner,
  ps.package_name,
  crm.missing_digest,
  crm.related_manifest_digest,
  crm.media_type,
  crm.hops_missing_to_related_manifest,
  t.tag,
  t.version_id
FROM closest_related_manifests crm
JOIN package_scans ps
  ON ps.scan_id = crm.scan_id
LEFT JOIN tags t
  ON t.scan_id = crm.scan_id
 AND t.digest = crm.related_manifest_digest;
