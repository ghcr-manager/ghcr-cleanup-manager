# Schema In Human Terms

This document explains the current DB schema.

## Big Picture

One scan of one package does this:

1. Ask GitHub Packages API for package versions.
2. Take each version's digest (`sha256:...`) as a start point.
3. Fetch manifest JSON from GHCR for those digests.
4. Process each fetched manifest payload for references to other digests.
5. Store known graph relations and precompute reachability for fast queries.

## Core Scan Tables

- `package_scans`
  - One row per scan run.
  - Stores immutable scan UUID, package owner, package name, start/end timestamps, status (`running|completed|failed`).

- `package_versions`
  - Rows from GitHub Packages API version list.
  - Each row has package-version identity and timestamps.
  - The raw payload keeps the GitHub API item, including the root digest.

- `tags`
  - Tag -> version mapping.
  - Built from GitHub package-version metadata (`metadata.container.tags`) during ingest.

## Manifest Content Tables

- `manifests`
  - One row per fetched package-version manifest digest.
  - Includes media type, an optional best-effort `manifest_kind`, and some extracted fields (`subject_digest`,
    config/media info, annotations).
  - Each row must have a matching `package_versions(scan_id, version_id)` row.

- `manifest_payloads`
  - Raw manifest JSON body as fetched from GHCR.

- `manifest_descriptors`
  - Direct child links read from manifest/index JSON.
  - Child digests may be absent from `manifests`.

## Manifest Graph Tables

These 3 are related but serve different purposes:

1. `manifest_descriptors`
   - Raw direct links from manifest JSON.
2. `manifest_edges`
   - App graph links we operate on (child links + referrer/subject links).
3. `manifest_reachability`
   - Precomputed transitive closure:
     - "Can digest A reach digest B?"
     - `min_distance` is shortest path length.

## "One Version -> One Manifest"

Important mental model:

- A `package_version` gives one digest.
- That digest is fetched as exactly one `manifests` row.
- Any digest named inside that manifest payload is stored as a relation, not fetched as an extra manifest unless it is
  also present as its own package version.

## Missing Manifests

Sometimes a fetched manifest payload references a digest that is not part of the package-version manifest set.

- Missing digests are not inserted into `manifests`.
- Missing digests are derived from descriptor rows and `subject_digest` values whose targets are absent from
  `manifests`.
- Query recipes: [missing-manifests-queries.md](missing-manifests-queries.md)

## Raw JSON Side Tables

- `package_version_payloads`: full raw GitHub package-version JSON items.
- `manifest_payloads`: full raw GHCR manifest JSON items.

## Manifest Classification

Each `manifests` row may have a derived `manifest_kind` field for debugging and exploratory SQL filtering.

Current values:

- `image_index`
- `image_manifest`
- `artifact_manifest`
- `attestation_manifest`
- `signature_manifest`

When the classifier does not assign a reliable category, `manifest_kind` stays `NULL`.

Treat this as best-effort helper data, not as authoritative OCI/GHCR fact. When correctness matters, fall back to
`media_type`, `artifact_type`, `subject_digest`, and raw JSON payloads.
