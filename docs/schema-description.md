# Schema In Human Terms

This document explains the current SQLite schema in practical terms.

For most inspection work, start with the visualizer rather than raw SQL:

- see [visualizer/README.md](../visualizer/README.md)

The database is still useful to query directly when you want audits, debugging, or one-off analysis across scans.

## Table Of Contents

- [Big Picture](#big-picture)
- [Mental Model](#mental-model)
- [Core Scan Tables](#core-scan-tables)
- [Manifest Tables](#manifest-tables)
- [Manifest Graph Tables](#manifest-graph-tables)
- [Cleanup Audit Tables](#cleanup-audit-tables)
- [Derived Views](#derived-views)
- [What Is And Is Not Fetched](#what-is-and-is-not-fetched)
- [Practical Reading Order](#practical-reading-order)

## Big Picture

One database can contain:

- many scans
- of many `owner/package` pairs
- plus optional cleanup audit runs linked to those scans

So the database is not “one package” or “one workflow run”. It is a local registry-analysis store.

The high-level flow is:

1. read package versions from the GitHub Packages API
2. read tags from those package-version payloads
3. fetch the root manifest JSON for each package-version digest from GHCR
4. store the fetched manifests and their direct relations
5. precompute reachability and graph membership
6. optionally persist cleanup planner and execution audit rows

## Mental Model

The most useful way to read the schema is:

- `package_versions` is GitHub’s deletable unit
- `tags` tells you which package version currently carries which human-readable names
- `manifests` is the root registry document for that package version
- `manifest_edges` says which known manifests point to which other known manifests
- `manifest_reachability` says what is reachable through those edges
- `manifest_graphs` says which fetched manifests belong to the same connected graph

So:

- GitHub Packages gives the version inventory
- GHCR gives the registry documents
- `ghcr-manager` joins both into one graph-aware model

## Core Scan Tables

### `package_scans`

One row per scan run.

Important columns:

- `scan_id`
- `scan_uuid`
- `owner`
- `package_name`
- `package_metadata_json`
- `github_actions_run_url`
- `scan_started_at`
- `scan_completed_at`
- `status`

What this means:

- a scan is the top-level unit for all registry data loaded at one point in time
- the same database can hold several scans for the same package over time
- it can also hold scans for different packages
- `package_metadata_json` keeps package-level metadata from GitHub
- `github_actions_run_url` records where the scan came from, when relevant

### `package_versions`

One row per GitHub Packages version entry within one scan.

Important columns:

- `scan_id`
- `version_id`
- `created_at`
- `updated_at`

What this means:

- this is GitHub’s package-version identity
- cleanup ultimately deletes package versions
- every fetched root manifest belongs to one `package_versions` row

### `package_version_payloads`

Raw GitHub Packages JSON for each `package_versions` row.

Use this when you need to verify what GitHub returned.

### `tags`

Maps a tag name to one package version within one scan.

Important columns:

- `scan_id`
- `tag`
- `version_id`
- `is_digest_tag`

What this means:

- tags such as `latest`, `1.2.3`, and `pr-123` live here
- a tag belongs to one package version in one scan
- `is_digest_tag = 1` marks helper-style digest tags such as `sha256-*`

## Manifest Tables

### `manifests`

One row per fetched root manifest that corresponds to a package version.

Important columns:

- `scan_id`
- `version_id`
- `digest`
- `media_type`
- `artifact_type`
- `config_media_type`
- `subject_digest`
- `annotations_json`
- `manifest_kind`

What this means:

- a package version points to exactly one fetched root manifest row
- that manifest may be an image, an index, a multi-arch manifest, or an OCI artifact-style document

`manifest_kind` is a helper classification used throughout the repo. Current values:

- `index_manifest`
- `multi_arch_manifest`
- `image_manifest`
- `artifact_manifest`
- `attestation_manifest`
- `signature_manifest`

If no known classification matches, `manifest_kind` is `NULL`.

When exact OCI meaning matters, trust the raw manifest payload first and `manifest_kind` second.

### `manifest_payloads`

Raw JSON body for each fetched manifest digest.

Use this when you need the exact registry document body that `ghcr-manager` classified and analyzed.

### `manifest_descriptors`

Direct child descriptors named inside fetched manifest JSON.

Important columns:

- `parent_digest`
- `child_digest`
- `media_type`
- `artifact_type`
- `platform_os`
- `platform_architecture`
- `platform_variant`

What this means:

- if a manifest document names another digest, a descriptor row is stored here
- the child digest does not need to exist as a fetched `manifests` row
- this table preserves what the manifest said even when the child is otherwise absent from the scanned package-version
  set

## Manifest Graph Tables

### `manifest_edges`

Direct known manifest-to-manifest relations where both endpoints exist in `manifests`.

Important columns:

- `parent_digest`
- `child_digest`
- `edge_kind`

Current edge kinds:

- `image-child`
- `referrer`
- `digest-tag-referrer`

What this means:

- image/index child relations become `image-child`
- subject/referrer relations become `referrer`
- helper digest-tag relations are modeled as `digest-tag-referrer`

This is the main direct graph table.

### `manifest_reachability`

Precomputed transitive closure over `manifest_edges`.

Important columns:

- `ancestor_digest`
- `descendant_digest`
- `min_distance`

What this means:

- if `A -> B` and `B -> C`, reachability stores `A -> B`, `B -> C`, and `A -> C`
- self rows are present with `min_distance = 0`

This table exists so planner and analysis queries do not need recursive SQL at read time.

### `manifest_graphs`

Connected-component ids for fetched manifests within one scan.

Important columns:

- `scan_id`
- `digest`
- `graph_id`

What this means:

- manifests that share a `graph_id` belong to the same connected graph inside that scan
- this is useful for graph-scoped analysis and visualizer work

## Cleanup Audit Tables

These matter only when the DB contains persisted `cleanup` runs.

### `cleanup_runs`

One row per `cleanup` invocation persisted to the database.

It stores:

- the exact `scan_id` planned from
- whether the run was dry-run
- planner inputs as JSON
- summary counts for direct targets, delete candidates, untag-only roots, fully deletable roots, blocked roots, and
  protected roots

### `cleanup_root_decisions`

One row per selected cleanup root decision.

Important columns:

- `digest`
- `selection_mode`
- `selection_reason`
- `validation_status`
- `validation_reason_code`
- `validation_reason`
- optional `blocking_digest`
- optional `overlap_digest`

What this means:

- this is the persisted root-level planner result
- it distinguishes:
  - fully deletable
  - blocked
  - untag-only
- it is digest-first for query convenience and does not try to persist selector-clause provenance
- `selection_mode` is constrained to:
  - `delete-root`
  - `untag-only`
- `selection_reason` is constrained to:
  - `delete-tags-all-tags-selected`
  - `delete-tags-partial-tag-match`
  - `delete-untagged`
  - `keep-n-tagged-overflow`
  - `keep-n-untagged-overflow`
- `validation_status` is constrained to:
  - `fully-deletable`
  - `blocked`
  - `untag-only`
- `validation_reason_code` is constrained to:
  - `untag-only-partial-tag-match`
  - `untag-only-retained-manifest`
  - `fully-deletable-no-retained-overlap`
  - `blocked-overlap-with-retained-root`

### `cleanup_selected_tags`

One row per concrete selected tag for a cleanup run.

Important columns:

- `tag`
- `is_deleted`

What this means:

- this is the tag-side audit evidence for cleanup
- it records concrete selected tags, not selector-clause provenance
- `is_deleted = 1` means the selected tag is planned to disappear in a dry-run or does disappear in a live cleanup
- `is_deleted = 0` means the selected tag survived
- version, digest, and root-outcome context are derived by joining through `tags`, `manifests`, and
  `cleanup_root_decisions`

### `cleanup_protected_root_blocks`

Normalized blocking explanation rows.

Important columns:

- `protected_digest`
- `blocked_digest`
- `overlap_digest`
- `block_reason_code`

What this means:

- root A blocked root B because both reach overlap manifest C
- this is the normalized evidence behind blocked delete decisions
- `block_reason_code` is currently constrained to:
  - `overlap-with-retained-root`
- the table enforces that explanation via foreign keys into `manifest_reachability`

## Derived Views

There is currently one live view:

### `v_latest_scan_per_package`

One latest completed scan per `owner/package`.

Use this when you want the current latest picture for a package without manually choosing a `scan_id`.

## What Is And Is Not Fetched

Important limitation:

- `manifests` contains only package-version-backed fetched root manifests
- a digest mentioned by a manifest is not fetched automatically just because it was referenced

So:

- known package-version digests become `manifests`
- referenced-but-absent digests are still visible through `manifest_descriptors`
- the graph model is intentionally bounded to what the scan actually knows

## Practical Reading Order

If you are using SQL directly, this order is usually enough:

1. `package_scans`
2. `v_latest_scan_per_package`
3. `package_versions`
4. `tags`
5. `manifests`
6. `manifest_edges`
7. `manifest_reachability`
8. cleanup audit tables, if a cleanup run exists

That is usually sufficient to understand:

- what was scanned
- what tags and root manifests exist
- how fetched manifests relate to each other
- what cleanup decided
