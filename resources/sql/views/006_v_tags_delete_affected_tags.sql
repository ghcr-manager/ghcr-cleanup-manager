DROP VIEW IF EXISTS v_tags_delete_affected_tags;

CREATE VIEW v_tags_delete_affected_tags AS
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
source_closure AS (
  SELECT
    st.scan_id,
    st.owner,
    st.package_name,
    st.source_tag,
    st.source_version_id,
    st.source_digest,
    st.source_manifest_kind,
    m.digest AS overlap_digest,
    m.manifest_kind AS overlap_manifest_kind,
    r.min_distance AS hops_source_to_overlap_manifest
  FROM source_tags st
  JOIN manifest_reachability r
    ON r.scan_id = st.scan_id
   AND r.ancestor_digest = st.source_digest
  JOIN manifests m
    ON m.scan_id = st.scan_id
   AND m.digest = r.descendant_digest
),
closure_manifests AS (
  SELECT DISTINCT
    scan_id,
    source_tag,
    overlap_digest AS delete_digest
  FROM source_closure
),
candidate_tags AS (
  SELECT
    t.scan_id,
    t.tag AS affected_tag,
    m.version_id AS affected_version_id,
    m.digest AS affected_digest,
    m.manifest_kind AS affected_manifest_kind
  FROM tags t
  JOIN manifests m
    ON m.scan_id = t.scan_id
   AND m.version_id = t.version_id
  JOIN v_latest_scan_per_package lsp
    ON lsp.scan_id = t.scan_id
),
candidate_members AS (
  SELECT
    ct.scan_id,
    ct.affected_tag,
    ct.affected_version_id,
    ct.affected_digest,
    ct.affected_manifest_kind,
    r.descendant_digest AS member_digest,
    r.min_distance AS hops_affected_tag_to_overlap_manifest
  FROM candidate_tags ct
  JOIN manifest_reachability r
    ON r.scan_id = ct.scan_id
   AND r.ancestor_digest = ct.affected_digest
),
overlapping_tags AS (
  SELECT
    sc.scan_id,
    sc.owner,
    sc.package_name,
    sc.source_tag,
    sc.source_version_id,
    sc.source_digest,
    sc.source_manifest_kind,
    ct.affected_tag,
    ct.affected_version_id,
    ct.affected_digest,
    ct.affected_manifest_kind,
    sc.overlap_digest,
    sc.overlap_manifest_kind,
    sc.hops_source_to_overlap_manifest,
    ct.hops_affected_tag_to_overlap_manifest
  FROM source_closure sc
  JOIN candidate_members ct
    ON ct.scan_id = sc.scan_id
   AND ct.member_digest = sc.overlap_digest
  LEFT JOIN closure_manifests cm
    ON cm.scan_id = sc.scan_id
   AND cm.source_tag = sc.source_tag
   AND cm.delete_digest = ct.affected_digest
  WHERE cm.delete_digest IS NULL
),
ranked_overlapping_tags AS (
  SELECT
    ot.*,
    COUNT(*) OVER (
      PARTITION BY ot.scan_id, ot.source_tag, ot.affected_tag
    ) AS overlap_manifest_count,
    ROW_NUMBER() OVER (
      PARTITION BY ot.scan_id, ot.source_tag, ot.affected_tag
      ORDER BY
        ot.hops_source_to_overlap_manifest,
        ot.hops_affected_tag_to_overlap_manifest,
        ot.overlap_digest
    ) AS rn
  FROM overlapping_tags ot
)
SELECT
  scan_id,
  owner,
  package_name,
  source_tag,
  source_version_id,
  source_digest,
  source_manifest_kind,
  affected_tag,
  affected_version_id,
  affected_digest,
  affected_manifest_kind,
  overlap_digest,
  overlap_manifest_kind,
  hops_source_to_overlap_manifest,
  hops_affected_tag_to_overlap_manifest,
  overlap_manifest_count
FROM ranked_overlapping_tags
WHERE rn = 1;
