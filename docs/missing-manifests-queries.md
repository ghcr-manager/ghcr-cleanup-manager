# Missing Manifests SQL Recipes

This document captures SQL recipes to find manifest digests that were discovered during ingest but are missing from
`manifests` in a completed scan.

Operational context:

- GHCR scans may encounter `404` for some digests.
- Ingest skips these missing manifests and continues.
- Missing digests can be derived from DB state; logs are not required as the only source.

## Target Scan CTE

All queries below use this base CTE:

```sql
WITH target_scan AS (
  SELECT scan_id
  FROM package_scans
  WHERE owner = 'aicage' AND package_name = 'aicage' AND status = 'completed'
  ORDER BY scan_started_at DESC
  LIMIT 1
)
```

Replace `'aicage/aicage'` with your package name.

## Missing Descriptor Children

Descriptor child digest exists, but no manifest row exists for that digest.

```sql
WITH target_scan AS (
  SELECT scan_id
  FROM package_scans
  WHERE owner = 'aicage' AND package_name = 'aicage' AND status = 'completed'
  ORDER BY scan_started_at DESC
  LIMIT 1
)
SELECT DISTINCT d.child_digest AS digest
FROM manifest_descriptors d
LEFT JOIN manifests m
  ON m.scan_id = d.scan_id
 AND m.digest = d.child_digest
WHERE d.scan_id = (SELECT scan_id FROM target_scan)
  AND m.digest IS NULL
ORDER BY digest;
```

## Missing Subjects

A manifest `subject_digest` points to a digest that has no manifest row.

```sql
WITH target_scan AS (
  SELECT scan_id
  FROM package_scans
  WHERE owner = 'aicage' AND package_name = 'aicage' AND status = 'completed'
  ORDER BY scan_started_at DESC
  LIMIT 1
)
SELECT DISTINCT mf.subject_digest AS digest
FROM manifests mf
LEFT JOIN manifests m
  ON m.scan_id = mf.scan_id
 AND m.digest = mf.subject_digest
WHERE mf.scan_id = (SELECT scan_id FROM target_scan)
  AND mf.subject_digest IS NOT NULL
  AND m.digest IS NULL
ORDER BY digest;
```

## Missing Union (Closest To Skip-Warn Semantics)

Distinct missing digests from descriptor children and subjects combined.

```sql
WITH target_scan AS (
  SELECT scan_id
  FROM package_scans
  WHERE owner = 'aicage' AND package_name = 'aicage' AND status = 'completed'
  ORDER BY scan_started_at DESC
  LIMIT 1
),
missing_descriptor_children AS (
  SELECT DISTINCT d.child_digest AS digest
  FROM manifest_descriptors d
  LEFT JOIN manifests m
    ON m.scan_id = d.scan_id
   AND m.digest = d.child_digest
  WHERE d.scan_id = (SELECT scan_id FROM target_scan)
    AND m.digest IS NULL
),
missing_subjects AS (
  SELECT DISTINCT mf.subject_digest AS digest
  FROM manifests mf
  LEFT JOIN manifests m
    ON m.scan_id = mf.scan_id
   AND m.digest = mf.subject_digest
  WHERE mf.scan_id = (SELECT scan_id FROM target_scan)
    AND mf.subject_digest IS NOT NULL
    AND m.digest IS NULL
)
SELECT digest
FROM (
  SELECT digest FROM missing_descriptor_children
  UNION
  SELECT digest FROM missing_subjects
)
ORDER BY digest;
```

## Count + Overlap Breakdown

Useful to explain why warn-line count and one single query can differ.

```sql
WITH target_scan AS (
  SELECT scan_id
  FROM package_scans
  WHERE owner = 'aicage' AND package_name = 'aicage' AND status = 'completed'
  ORDER BY scan_started_at DESC
  LIMIT 1
),
a AS (
  SELECT DISTINCT d.child_digest AS digest
  FROM manifest_descriptors d
  LEFT JOIN manifests m
    ON m.scan_id = d.scan_id
   AND m.digest = d.child_digest
  WHERE d.scan_id = (SELECT scan_id FROM target_scan)
    AND m.digest IS NULL
),
b AS (
  SELECT DISTINCT mf.subject_digest AS digest
  FROM manifests mf
  LEFT JOIN manifests m
    ON m.scan_id = mf.scan_id
   AND m.digest = mf.subject_digest
  WHERE mf.scan_id = (SELECT scan_id FROM target_scan)
    AND mf.subject_digest IS NOT NULL
    AND m.digest IS NULL
)
SELECT
  (SELECT COUNT(*) FROM a) AS missing_descriptor_children,
  (SELECT COUNT(*) FROM b) AS missing_subjects,
  (SELECT COUNT(*) FROM (SELECT digest FROM a UNION SELECT digest FROM b)) AS missing_union,
  (SELECT COUNT(*) FROM (SELECT digest FROM a INTERSECT SELECT digest FROM b)) AS overlap;
```

## Affected Package Versions For Each Missing Digest

Map each missing digest to package version roots that can reach the nearest existing manifest which referenced it.

Why this indirection is needed:

- Missing digests are not present in `manifests`.
- `manifest_reachability` only contains known (fetched) digests from `manifests`.
- So we first map missing digest -> existing "anchor" manifest, then root version digest -> anchor via reachability.

```sql
WITH target_scan AS (
  SELECT scan_id
  FROM package_scans
  WHERE owner = 'aicage' AND package_name = 'aicage' AND status = 'completed'
  ORDER BY scan_started_at DESC
  LIMIT 1
),
missing_refs AS (
  -- descriptor child missing: parent exists, child missing
  SELECT DISTINCT
    d.child_digest AS missing_digest,
    d.parent_digest AS anchor_digest,
    'descriptor-child' AS reason
  FROM manifest_descriptors d
  LEFT JOIN manifests m
    ON m.scan_id = d.scan_id
   AND m.digest = d.child_digest
  WHERE d.scan_id = (SELECT scan_id FROM target_scan)
    AND m.digest IS NULL

  UNION ALL

  -- subject missing: artifact manifest exists, its subject is missing
  SELECT DISTINCT
    mf.subject_digest AS missing_digest,
    mf.digest AS anchor_digest,
    'subject' AS reason
  FROM manifests mf
  LEFT JOIN manifests m
    ON m.scan_id = mf.scan_id
   AND m.digest = mf.subject_digest
  WHERE mf.scan_id = (SELECT scan_id FROM target_scan)
    AND mf.subject_digest IS NOT NULL
    AND m.digest IS NULL
)
SELECT
  mr.missing_digest,
  mr.reason,
  pv.version_id,
  pv.digest AS version_root_digest,
  mr.anchor_digest,
  COALESCE(r.min_distance, 0) AS hops_root_to_anchor
FROM missing_refs mr
JOIN package_versions pv
  ON pv.scan_id = (SELECT scan_id FROM target_scan)
LEFT JOIN manifest_reachability r
  ON r.scan_id = pv.scan_id
 AND r.ancestor_digest = pv.digest
 AND r.descendant_digest = mr.anchor_digest
WHERE pv.digest = mr.anchor_digest
   OR r.ancestor_digest IS NOT NULL
ORDER BY mr.missing_digest, pv.version_id;
```

Optional tag join:

```sql
LEFT JOIN tags t
  ON t.scan_id = pv.scan_id
 AND t.version_id = pv.version_id
```

## One Concrete Chain For A Selected Missing Digest

Given one missing digest, return one shortest root->...->anchor chain per affected version.

Column meaning used below:

- `root_digest`: package version start digest from `package_versions.digest`.
- `anchor_digest`: existing manifest digest that directly references the missing digest.
- `hops_root_to_anchor`: number of edges from `root_digest` to `anchor_digest` (can be `0` when both are the same
  digest).
- `full_chain_including_missing`: root->...->anchor plus final `-> missing_digest`.

Set:

- package name in `target_scan`
- missing digest in `selected_missing`

```sql
WITH RECURSIVE
target_scan AS (
  SELECT scan_id
  FROM package_scans
  WHERE owner = 'aicage' AND package_name = 'aicage' AND status = 'completed'
  ORDER BY scan_started_at DESC
  LIMIT 1
),
selected_missing AS (
  SELECT 'sha256:replace-me' AS missing_digest
),
missing_refs AS (
  SELECT DISTINCT
    d.child_digest AS missing_digest,
    d.parent_digest AS anchor_digest,
    'descriptor-child' AS reason
  FROM manifest_descriptors d
  LEFT JOIN manifests m
    ON m.scan_id = d.scan_id
   AND m.digest = d.child_digest
  WHERE d.scan_id = (SELECT scan_id FROM target_scan)
    AND m.digest IS NULL

  UNION ALL

  SELECT DISTINCT
    mf.subject_digest AS missing_digest,
    mf.digest AS anchor_digest,
    'subject' AS reason
  FROM manifests mf
  LEFT JOIN manifests m
    ON m.scan_id = mf.scan_id
   AND m.digest = mf.subject_digest
  WHERE mf.scan_id = (SELECT scan_id FROM target_scan)
    AND mf.subject_digest IS NOT NULL
    AND m.digest IS NULL
),
selected_anchors AS (
  SELECT mr.missing_digest, mr.anchor_digest, mr.reason
  FROM missing_refs mr
  JOIN selected_missing sm ON sm.missing_digest = mr.missing_digest
),
affected_roots AS (
  SELECT
    sa.missing_digest,
    sa.anchor_digest,
    sa.reason,
    pv.version_id,
    pv.digest AS root_digest
  FROM selected_anchors sa
  JOIN package_versions pv
    ON pv.scan_id = (SELECT scan_id FROM target_scan)
  LEFT JOIN manifest_reachability r
    ON r.scan_id = pv.scan_id
   AND r.ancestor_digest = pv.digest
   AND r.descendant_digest = sa.anchor_digest
  WHERE pv.digest = sa.anchor_digest
     OR r.ancestor_digest IS NOT NULL
),
edges AS (
  SELECT parent_digest, child_digest
  FROM manifest_edges
  WHERE scan_id = (SELECT scan_id FROM target_scan)
),
walk AS (
  SELECT
    ar.missing_digest,
    ar.reason,
    ar.version_id,
    ar.root_digest,
    ar.anchor_digest,
    ar.root_digest AS node_digest,
    0 AS depth,
    ar.root_digest AS path
  FROM affected_roots ar

  UNION ALL

  SELECT
    w.missing_digest,
    w.reason,
    w.version_id,
    w.root_digest,
    w.anchor_digest,
    e.child_digest AS node_digest,
    w.depth + 1 AS depth,
    w.path || ' -> ' || e.child_digest AS path
  FROM walk w
  JOIN edges e ON e.parent_digest = w.node_digest
  WHERE instr(w.path, e.child_digest) = 0
    AND w.depth < 40
),
ranked_hits AS (
  SELECT
    w.*,
    ROW_NUMBER() OVER (
      PARTITION BY w.missing_digest, w.version_id, w.anchor_digest
      ORDER BY w.depth ASC
    ) AS rn
  FROM walk w
  WHERE w.node_digest = w.anchor_digest
)
SELECT
  missing_digest,
  reason,
  version_id,
  root_digest, -- package version start digest
  anchor_digest, -- existing digest that points to missing_digest
  depth AS hops_root_to_anchor, -- edges from root_digest to anchor_digest
  depth + 1 AS hops_root_to_missing, -- includes final anchor->missing edge
  path || ' -> ' || missing_digest AS full_chain_including_missing
FROM ranked_hits
WHERE rn = 1
ORDER BY version_id, anchor_digest;
```

## From Missing Digest To Related Tags In Same Package Scan

One row per `missing_digest + tag` where the tag is in the same target scan/package and graph-related to the missing
digest anchor.

```sql
WITH target_scan AS (
  SELECT scan_id
  FROM package_scans
  WHERE owner = 'aicage' AND package_name = 'aicage' AND status = 'completed'
  ORDER BY scan_started_at DESC
  LIMIT 1
),
missing_refs AS (
  SELECT DISTINCT
    d.child_digest AS missing_digest,
    d.parent_digest AS anchor_digest
  FROM manifest_descriptors d
  JOIN target_scan ts ON ts.scan_id = d.scan_id
  LEFT JOIN manifests m
    ON m.scan_id = d.scan_id
   AND m.digest = d.child_digest
  WHERE m.digest IS NULL

  UNION

  SELECT DISTINCT
    mf.subject_digest AS missing_digest,
    mf.digest AS anchor_digest
  FROM manifests mf
  JOIN target_scan ts ON ts.scan_id = mf.scan_id
  LEFT JOIN manifests m
    ON m.scan_id = mf.scan_id
   AND m.digest = mf.subject_digest
  WHERE mf.subject_digest IS NOT NULL
    AND m.digest IS NULL
),
affected_tags AS (
  SELECT DISTINCT
    mr.missing_digest,
    t.tag,
    t.version_id,
    t.digest AS tag_digest
  FROM target_scan ts
  JOIN tags t
    ON t.scan_id = ts.scan_id
  JOIN missing_refs mr
    ON t.digest = mr.anchor_digest
    OR EXISTS (
      SELECT 1
      FROM manifest_reachability r
      WHERE r.scan_id = ts.scan_id
        AND r.ancestor_digest = t.digest
        AND r.descendant_digest = mr.anchor_digest
    )
    OR EXISTS (
      SELECT 1
      FROM manifest_reachability r
      WHERE r.scan_id = ts.scan_id
        AND r.ancestor_digest = mr.anchor_digest
        AND r.descendant_digest = t.digest
    )
)
SELECT
  missing_digest,
  tag,
  version_id,
  tag_digest
FROM affected_tags
ORDER BY missing_digest, tag;
```

## From Missing Digest To Related Tags Across Packages

Use missing digests from one source package scan, then search tags in latest completed scan of every package.

```sql
WITH source_scan AS (
  SELECT scan_id
  FROM package_scans
  WHERE owner = 'aicage' AND package_name = 'aicage' AND status = 'completed'
  ORDER BY scan_started_at DESC
  LIMIT 1
),
missing_refs AS (
  SELECT DISTINCT
    d.child_digest AS missing_digest,
    d.parent_digest AS anchor_digest
  FROM manifest_descriptors d
  JOIN source_scan ss ON ss.scan_id = d.scan_id
  LEFT JOIN manifests m
    ON m.scan_id = d.scan_id
   AND m.digest = d.child_digest
  WHERE m.digest IS NULL

  UNION

  SELECT DISTINCT
    mf.subject_digest AS missing_digest,
    mf.digest AS anchor_digest
  FROM manifests mf
  JOIN source_scan ss ON ss.scan_id = mf.scan_id
  LEFT JOIN manifests m
    ON m.scan_id = mf.scan_id
   AND m.digest = mf.subject_digest
  WHERE mf.subject_digest IS NOT NULL
    AND m.digest IS NULL
),
latest_scan_per_package AS (
  SELECT scan_id, package_name
  FROM (
    SELECT
      ps.scan_id,
      ps.package_name,
      ROW_NUMBER() OVER (
        PARTITION BY ps.package_name
        ORDER BY ps.scan_started_at DESC
      ) AS rn
    FROM package_scans ps
    WHERE ps.status = 'completed'
  )
  WHERE rn = 1
),
cross_package_related_tags AS (
  SELECT DISTINCT
    mr.missing_digest,
    lsp.package_name,
    t.tag,
    t.version_id,
    t.digest AS tag_digest
  FROM missing_refs mr
  JOIN latest_scan_per_package lsp ON 1 = 1
  JOIN tags t
    ON t.scan_id = lsp.scan_id
  WHERE t.digest = mr.anchor_digest
     OR EXISTS (
       SELECT 1
       FROM manifest_reachability r
       WHERE r.scan_id = lsp.scan_id
         AND r.ancestor_digest = t.digest
         AND r.descendant_digest = mr.anchor_digest
     )
     OR EXISTS (
       SELECT 1
       FROM manifest_reachability r
       WHERE r.scan_id = lsp.scan_id
         AND r.ancestor_digest = mr.anchor_digest
         AND r.descendant_digest = t.digest
     )
)
SELECT
  missing_digest,
  package_name,
  tag,
  version_id,
  tag_digest
FROM cross_package_related_tags
ORDER BY missing_digest, package_name, tag;
```

Notes:

- This is cross-package by digest identity and graph relations in each package's latest completed scan.
- For larger DBs, restrict `latest_scan_per_package` to a subset of package names to keep runtime bounded.

## From Missing Digest To Related Manifests (+ Optional Tags, + Hops)

One row per related manifest. Tags are optional (`NULL` when a related manifest is not directly tagged).

`hops_missing_to_related_manifest` meaning:

- `1` means `anchor -> missing` and related manifest is the anchor itself.
- Greater values mean additional graph edges between anchor and related manifest.

```sql
WITH source_scan AS (
  SELECT scan_id
  FROM package_scans
  WHERE owner = 'aicage' AND package_name = 'aicage' AND status = 'completed'
  ORDER BY scan_started_at DESC
  LIMIT 1
),
missing_refs AS (
  SELECT DISTINCT
    d.child_digest AS missing_digest,
    d.parent_digest AS anchor_digest
  FROM manifest_descriptors d
  JOIN source_scan ss ON ss.scan_id = d.scan_id
  LEFT JOIN manifests m
    ON m.scan_id = d.scan_id
   AND m.digest = d.child_digest
  WHERE m.digest IS NULL

  UNION

  SELECT DISTINCT
    mf.subject_digest AS missing_digest,
    mf.digest AS anchor_digest
  FROM manifests mf
  JOIN source_scan ss ON ss.scan_id = mf.scan_id
  LEFT JOIN manifests m
    ON m.scan_id = mf.scan_id
   AND m.digest = mf.subject_digest
  WHERE mf.subject_digest IS NOT NULL
    AND m.digest IS NULL
),
latest_scan_per_package AS (
  SELECT scan_id, package_name
  FROM (
    SELECT
      ps.scan_id,
      ps.package_name,
      ROW_NUMBER() OVER (
        PARTITION BY ps.package_name
        ORDER BY ps.scan_started_at DESC
      ) AS rn
    FROM package_scans ps
    WHERE ps.status = 'completed'
  )
  WHERE rn = 1
),
related_manifests AS (
  -- related digest equals anchor
  SELECT DISTINCT
    mr.missing_digest,
    lsp.package_name,
    m.scan_id,
    m.digest AS related_manifest_digest,
    m.media_type,
    1 AS hops_missing_to_related_manifest
  FROM missing_refs mr
  JOIN latest_scan_per_package lsp ON 1 = 1
  JOIN manifests m
    ON m.scan_id = lsp.scan_id
   AND m.digest = mr.anchor_digest

  UNION

  -- related digest can reach anchor
  SELECT DISTINCT
    mr.missing_digest,
    lsp.package_name,
    m.scan_id,
    m.digest AS related_manifest_digest,
    m.media_type,
    r.min_distance + 1 AS hops_missing_to_related_manifest
  FROM missing_refs mr
  JOIN latest_scan_per_package lsp ON 1 = 1
  JOIN manifests m
    ON m.scan_id = lsp.scan_id
  JOIN manifest_reachability r
    ON r.scan_id = m.scan_id
   AND r.ancestor_digest = m.digest
   AND r.descendant_digest = mr.anchor_digest

  UNION

  -- anchor can reach related digest
  SELECT DISTINCT
    mr.missing_digest,
    lsp.package_name,
    m.scan_id,
    m.digest AS related_manifest_digest,
    m.media_type,
    r.min_distance + 1 AS hops_missing_to_related_manifest
  FROM missing_refs mr
  JOIN latest_scan_per_package lsp ON 1 = 1
  JOIN manifests m
    ON m.scan_id = lsp.scan_id
  JOIN manifest_reachability r
    ON r.scan_id = m.scan_id
   AND r.ancestor_digest = mr.anchor_digest
   AND r.descendant_digest = m.digest
),
closest_related_manifests AS (
  SELECT
    missing_digest,
    package_name,
    scan_id,
    related_manifest_digest,
    media_type,
    MIN(hops_missing_to_related_manifest) AS hops_missing_to_related_manifest
  FROM related_manifests
  GROUP BY
    missing_digest,
    package_name,
    scan_id,
    related_manifest_digest,
    media_type
)
SELECT
  crm.missing_digest,
  crm.package_name,
  crm.related_manifest_digest,
  crm.media_type,
  crm.hops_missing_to_related_manifest,
  t.tag,
  t.version_id
FROM closest_related_manifests crm
LEFT JOIN tags t
  ON t.scan_id = crm.scan_id
 AND t.digest = crm.related_manifest_digest
ORDER BY
  crm.missing_digest,
  crm.package_name,
  crm.hops_missing_to_related_manifest,
  crm.related_manifest_digest,
  t.tag;
```
