DROP VIEW IF EXISTS v_tags_delete_manifests;

CREATE VIEW v_tags_delete_manifests AS
WITH source_tags AS (
  SELECT
    t.scan_id,
    lsp.owner,
    lsp.package_name,
    t.tag AS source_tag,
    m.version_id AS source_version_id,
    m.digest AS source_digest,
    m.manifest_kind AS source_manifest_kind
  FROM tags t
  JOIN manifests m
    ON m.scan_id = t.scan_id
   AND m.version_id = t.version_id
  JOIN v_latest_scan_per_package lsp
    ON lsp.scan_id = t.scan_id
),
delete_manifests AS (
  SELECT
    st.scan_id,
    st.owner,
    st.package_name,
    st.source_tag,
    st.source_version_id,
    st.source_digest,
    st.source_manifest_kind,
    m.digest AS delete_digest,
    m.manifest_kind AS delete_manifest_kind,
    m.version_id AS delete_version_id,
    r.min_distance AS hops_source_to_delete_manifest
  FROM source_tags st
  JOIN manifest_reachability r
    ON r.scan_id = st.scan_id
   AND r.ancestor_digest = st.source_digest
  JOIN manifests m
    ON m.scan_id = st.scan_id
   AND m.digest = r.descendant_digest
)
SELECT
  dm.scan_id,
  dm.owner,
  dm.package_name,
  dm.source_tag,
  dm.source_version_id,
  dm.source_digest,
  dm.source_manifest_kind,
  dm.delete_digest,
  dm.delete_manifest_kind,
  dm.delete_version_id,
  pv.created_at AS delete_created_at,
  pv.updated_at AS delete_updated_at,
  dm.hops_source_to_delete_manifest,
  t.tag AS delete_tag
FROM delete_manifests dm
JOIN package_versions pv
  ON pv.scan_id = dm.scan_id
 AND pv.version_id = dm.delete_version_id
LEFT JOIN tags t
  ON t.scan_id = dm.scan_id
 AND t.version_id = dm.delete_version_id;
