# Schema In Human Terms

This document explains the current DB schema.

## Big Picture

One scan of one package does this:

1. Ask GitHub Packages API for package versions.
2. Take each version's digest (`sha256:...`) as a start point.
3. Fetch manifest JSON from GHCR for those digests.
4. From each fetched manifest, discover more digests it points to.
5. Fetch those too, until no new digests are found.
6. Store graph relations and precompute reachability for fast queries.

## Core Scan Tables

- `package_scans`
  - One row per scan run.
  - Stores immutable scan UUID, package owner, package name, start/end timestamps, status (`running|completed|failed`).

- `package_versions`
  - Rows from GitHub Packages API version list.
  - Each row has a digest.
  - Think: "starting points for manifest crawling."

- `tags`
  - Tag -> version/digest mapping.
  - Built from GitHub package-version metadata (`metadata.container.tags`) during ingest.

## Manifest Content Tables

- `manifests`
  - One row per fetched manifest digest.
  - Includes media type and some extracted fields (`subject_digest`, config/media info, annotations).

- `manifest_payloads`
  - Raw manifest JSON body as fetched from GHCR.

- `manifest_descriptors`
  - Direct child links read from manifest/index JSON.
  - Think raw "this digest references that child digest" rows.

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

## "One Version -> Many Manifests"

Important mental model:

- A `package_version` gives one digest.
- That digest can be an index/list that points to many child manifests.
- Those children can point further.
- Result: one version digest can lead to a whole connected manifest subgraph.

So `package_versions` is not "all manifests". It is the initial digest list we start from.

## Missing Manifests

Sometimes GHCR returns `404` for referenced digests.

- Ingest currently skips those missing manifests and continues.
- Missing digests can still be analyzed later from DB state.
- Query recipes: [missing-manifests-queries.md](missing-manifests-queries.md)

## Raw JSON Side Tables

- `package_version_payloads`: full raw GitHub package-version JSON items.
- `manifest_payloads`: full raw GHCR manifest JSON items.
