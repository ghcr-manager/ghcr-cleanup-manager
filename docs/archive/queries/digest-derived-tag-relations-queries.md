# Digest-Derived Tag Relation Queries

This note captures practical ways to inspect the derived `sha256-*` tag relation view.

Operational context:

- `v_digest_derived_tag_relations` is heuristic helper data.
- It does not add rows to `manifest_edges`.
- It infers a candidate parent digest from a digest-shaped tag name such as `sha256-<digest>.sig`.

## SQL Recipes

### All Digest-Derived Tag Relations

```sql
SELECT
  owner,
  package_name,
  tag,
  artifact_digest,
  artifact_manifest_kind,
  artifact_subject_digest,
  inferred_parent_digest,
  parent_exists,
  parent_digest,
  subject_matches_inferred_parent
FROM v_digest_derived_tag_relations
WHERE owner = 'aicage'
  AND package_name = 'aicage'
ORDER BY tag;
```

### Only Orphan Candidates

```sql
SELECT
  owner,
  package_name,
  tag,
  artifact_digest,
  inferred_parent_digest,
  artifact_subject_digest
FROM v_digest_derived_tag_relations
WHERE owner = 'aicage'
  AND package_name = 'aicage'
  AND parent_exists = 0
ORDER BY tag;
```

### Compare Tag Heuristic With Manifest `subject`

```sql
SELECT
  tag,
  artifact_digest,
  artifact_subject_digest,
  inferred_parent_digest,
  subject_matches_inferred_parent,
  parent_exists
FROM v_digest_derived_tag_relations
WHERE owner = 'aicage'
  AND package_name = 'aicage'
ORDER BY subject_matches_inferred_parent, tag;
```

Interpretation:

- `subject_matches_inferred_parent = 1` The manifest payload and digest-derived tag point to the same parent digest.
- `subject_matches_inferred_parent = 0` The tag naming convention and manifest payload do not agree, or the artifact has
  no `subject.digest`.
