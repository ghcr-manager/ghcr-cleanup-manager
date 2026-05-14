# Missing Manifests SQL Recipes

This document captures SQL recipes for digest references that appear inside fetched manifest payloads but do not have a
matching row in `manifests`.

Operational context:

- `manifests` contains package-version-backed manifest rows only.
- `manifest_edges` contains known relations where both endpoint digests exist in `manifests`.
- Missing targets are derived from `manifest_descriptors` and `manifests.subject_digest`.

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

## Missing Digests

```sql
WITH target_scan AS (
  SELECT scan_id
  FROM package_scans
  WHERE owner = 'aicage' AND package_name = 'aicage' AND status = 'completed'
  ORDER BY scan_started_at DESC
  LIMIT 1
)
SELECT DISTINCT missing_digest AS digest
FROM v_missing_digests
WHERE scan_id = (SELECT scan_id FROM target_scan)
ORDER BY digest;
```

For the latest completed scan of every package, use the built-in view:

```sql
SELECT owner, package_name, missing_digest, anchor_digest
FROM v_missing_digests
ORDER BY owner, package_name, missing_digest, anchor_digest;
```

## Referencing Manifests

```sql
WITH target_scan AS (
  SELECT scan_id
  FROM package_scans
  WHERE owner = 'aicage' AND package_name = 'aicage' AND status = 'completed'
  ORDER BY scan_started_at DESC
  LIMIT 1
)
SELECT
  md.missing_digest,
  md.anchor_digest,
  m.manifest_kind AS source_manifest_kind,
  pv.version_id,
  pv.created_at,
  pv.updated_at,
  t.tag
FROM v_missing_digests md
JOIN manifests m
  ON m.scan_id = md.scan_id
 AND m.digest = md.anchor_digest
JOIN package_versions pv
  ON pv.scan_id = m.scan_id
 AND pv.version_id = m.version_id
LEFT JOIN tags t
  ON t.scan_id = pv.scan_id
 AND t.version_id = pv.version_id
WHERE md.scan_id = (SELECT scan_id FROM target_scan)
ORDER BY md.missing_digest, pv.version_id, t.tag;
```

## Related Known Manifests

Use the built-in view when you want the nearest known manifests around each missing digest:

```sql
SELECT
  owner,
  package_name,
  missing_digest,
  related_manifest_digest,
  manifest_kind,
  hops_missing_to_related_manifest,
  tag,
  version_id
FROM v_missing_digests_related_manifests
ORDER BY owner, package_name, missing_digest, hops_missing_to_related_manifest, related_manifest_digest;
```
