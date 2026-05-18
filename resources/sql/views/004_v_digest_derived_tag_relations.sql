DROP VIEW IF EXISTS v_digest_derived_tag_relations;

CREATE VIEW v_digest_derived_tag_relations AS
WITH digest_like_tags AS (
  SELECT
    lsp.scan_id,
    lsp.owner,
    lsp.package_name,
    t.tag,
    t.version_id AS artifact_version_id,
    m.digest AS artifact_digest,
    m.manifest_kind AS artifact_manifest_kind,
    m.subject_digest AS artifact_subject_digest,
    'sha256:' || SUBSTR(t.tag, 8, 64) AS inferred_parent_digest,
    SUBSTR(t.tag, 72) AS tag_suffix
  FROM tags t
  JOIN v_latest_scan_per_package lsp
    ON lsp.scan_id = t.scan_id
  JOIN manifests m
    ON m.scan_id = t.scan_id
   AND m.version_id = t.version_id
  WHERE t.tag LIKE 'sha256-%'
    AND LENGTH(t.tag) >= 71
    AND SUBSTR(t.tag, 8, 64) NOT GLOB '*[^0-9A-Fa-f]*'
)
SELECT
  dlt.scan_id,
  dlt.owner,
  dlt.package_name,
  dlt.tag,
  dlt.artifact_version_id,
  dlt.artifact_digest,
  dlt.artifact_manifest_kind,
  dlt.artifact_subject_digest,
  dlt.inferred_parent_digest,
  dlt.tag_suffix,
  pm.version_id AS parent_version_id,
  pm.digest AS parent_digest,
  pm.manifest_kind AS parent_manifest_kind,
  CASE
    WHEN dlt.artifact_subject_digest = dlt.inferred_parent_digest THEN 1
    ELSE 0
  END AS subject_matches_inferred_parent,
  CASE
    WHEN pm.digest IS NULL THEN 0
    ELSE 1
  END AS parent_exists
FROM digest_like_tags dlt
LEFT JOIN manifests pm
  ON pm.scan_id = dlt.scan_id
 AND pm.digest = dlt.inferred_parent_digest;
