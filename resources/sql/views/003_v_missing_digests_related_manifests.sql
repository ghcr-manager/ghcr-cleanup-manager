DROP VIEW IF EXISTS v_missing_digests_related_manifests;

CREATE VIEW v_missing_digests_related_manifests AS
WITH
related_manifests AS (
  SELECT DISTINCT
    m.scan_id,
    md.missing_digest,
    m.digest AS related_manifest_digest,
    m.manifest_kind,
    1 AS hops_missing_to_related_manifest
  FROM v_missing_digests md
  JOIN manifests m
    ON m.scan_id = md.scan_id
   AND m.digest = md.anchor_digest

  UNION

  SELECT DISTINCT
    m.scan_id,
    md.missing_digest,
    m.digest AS related_manifest_digest,
    m.manifest_kind,
    r.min_distance + 1 AS hops_missing_to_related_manifest
  FROM v_missing_digests md
  JOIN manifests m
    ON m.scan_id = md.scan_id
  JOIN manifest_reachability r
    ON r.scan_id = m.scan_id
   AND r.ancestor_digest = m.digest
   AND r.descendant_digest = md.anchor_digest

  UNION

  SELECT DISTINCT
    m.scan_id,
    md.missing_digest,
    m.digest AS related_manifest_digest,
    m.manifest_kind,
    r.min_distance + 1 AS hops_missing_to_related_manifest
  FROM v_missing_digests md
  JOIN manifests m
    ON m.scan_id = md.scan_id
  JOIN manifest_reachability r
    ON r.scan_id = m.scan_id
   AND r.ancestor_digest = md.anchor_digest
   AND r.descendant_digest = m.digest
),
closest_related_manifests AS (
  SELECT
    scan_id,
    missing_digest,
    related_manifest_digest,
    manifest_kind,
    MIN(hops_missing_to_related_manifest) AS hops_missing_to_related_manifest
  FROM related_manifests
  GROUP BY
    missing_digest,
    scan_id,
    related_manifest_digest,
    manifest_kind
)
SELECT
  ps.scan_id,
  ps.owner,
  ps.package_name,
  crm.missing_digest,
  crm.related_manifest_digest,
  crm.manifest_kind,
  crm.hops_missing_to_related_manifest,
  t.tag,
  t.version_id
FROM closest_related_manifests crm
JOIN package_scans ps
  ON ps.scan_id = crm.scan_id
LEFT JOIN manifests tm
  ON tm.scan_id = crm.scan_id
 AND tm.digest = crm.related_manifest_digest
LEFT JOIN tags t
  ON t.scan_id = tm.scan_id
 AND tm.version_id = t.version_id;
