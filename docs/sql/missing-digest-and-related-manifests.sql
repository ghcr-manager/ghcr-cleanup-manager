/*
## Missing Digests And Related Manifests (+ Optional Tags, + Hops)

One row per related manifest. Tags are optional (`NULL` when a related manifest is not directly tagged).

`hops_missing_to_related_manifest` meaning:

- `1` means `source -> missing` and related manifest is the source itself.
- Greater values mean additional graph edges between source and related manifest.
*/

SELECT
    scan_id,
    owner,
    package_name,
    missing_digest,
    related_manifest_digest,
    manifest_kind,
    hops_missing_to_related_manifest,
    tag,
    version_id
FROM v_missing_digests_related_manifests
ORDER BY
    owner,
    package_name,
    missing_digest,
    hops_missing_to_related_manifest,
    related_manifest_digest;
