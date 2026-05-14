# Implementation Notes

This document tracks the current implementation plan, decisions, and completed increments for `ghcr-manager`.

## Session Handoff

This section is the canonical place for session-to-session continuity.

- Developer glossary: [docs/terminology.md](terminology.md)

### Completed Checkpoints

- ☑ `6899876` Add GHCR manager analysis and roadmap.
- ☑ `bc651cb` Add initial TypeScript project scaffold.
- ☑ `2483a75` Replace Python linting with Node-native tooling.
- ☑ `b902eda` Strengthen session handoff documentation.
- ☑ `9d2eb23` Add live GHCR package scan support.
- ☑ `e33d011` Restructure modules and enforce source-test boundaries.
- ☑ `38159a1` Add scan logging and auth debug helper.
- ☑ `b854e18` Generalize paginated GitHub ingest.
- ☑ `5160246` Enforce foreign keys in the scan schema.
- ☑ `1166d0c` Improve GitHub and GHCR error reporting.
- ☑ `c61c531` Refine tag foreign keys and trim schema tests.

### Completed Plan

- ☑ Inspect current repo state and existing workflow assumptions for a TypeScript-based scaffold.
- ☑ Add lightweight project tracking docs for decisions, scope, and next increments.
- ☑ Scaffold minimal TypeScript project structure for shared core, CLI, and action entrypoint.
- ☑ Add initial SQLite schema/repository, fixture-backed scan flow, and planner summary.
- ☑ Add focused tests and update CI/lint configuration for the new stack.
- ☑ Run validation commands and summarize completed work plus next steps.

### Current Next Plan

- ☑ Add package scopes to the DB schema so one SQLite database can store multiple owner/package scans.
- ☑ Add a real GitHub Packages and GHCR ingest adapter beside the fixture loader.
- ☑ Normalize live package, version, tag, manifest, and edge data into the existing SQLite schema.
- ☑ Refactor ingest so GitHub and fixture input write incrementally into SQLite instead of assembling package-level
  in-memory snapshots.
- ☑ Introduce a generic paginated ingest pipeline for request -> normalize -> write and move package version/tag
  enumeration onto it.
- ☑ Add a derived reachability table to the schema for non-recursive manifest graph reads.
- ☑ Add raw-payload master tables for package-version items and manifest items.
- ☑ Split `package_versions.metadata_json` into a separate table for consistency with raw payload storage.
- ☑ Write raw package-version and manifest response JSON into dedicated payload tables during live ingest.
- ☑ Split fetched manifest documents from index child descriptors at the schema level.
- ☑ Write index child descriptor rows into `manifest_descriptors` and track missing referenced manifests separately.
- ☑ Extract `config_media_type`, `subject_digest`, and `annotations_json` from fetched manifest JSON into `manifests`.
- ☑ Cache and reuse GHCR pull tokens during manifest scans, refreshing based on token expiry instead of reloading per
  manifest.
- ☑ Fetch GHCR manifests with bounded parallelism instead of strictly one-by-one, with a code-local concurrency constant
  for easy tuning.
- ☑ Fetch GitHub package-version pages with bounded parallelism instead of strict sequential paging, with a code-local
  concurrency constant for easy tuning.
- ☑ Add bounded retry handling for GitHub/GHCR requests; after the retry budget is exhausted, the scan fails immediately
  with context-rich errors.
- ☐ Expand planner output so it explains why versions are protected or deletable.
- ☑ Add manifest kind classification so image indexes, image manifests, signatures, and attestations are queryable
  without ad-hoc JSON inspection.
- ☐ Add tests for multi-arch images, referrers, and explicit tag exclusion behavior.
- ☐ Revisit action packaging after the live ingest path exists.

### Current State Summary

- Runtime: Node.js and TypeScript.
- Linting: ESLint, `eslint-plugin-yml`, `markdownlint-cli2`, and Prettier.
- Persistence model: local SQLite database per run.
- Current ingest sources:
  - live GitHub Packages plus GHCR manifest scan for one org-owned container package
  - local JSON snapshot fixture in `tests/helpers` as a test helper only
- Current ingest implementation:
  - writes fixture and live GitHub/GHCR results incrementally into SQLite
  - uses a dedicated GHCR registry token client for bearer-token acquisition
  - requires explicit GitHub token input for all scans (no anonymous path)
  - uses a shared paginated ingest helper for GitHub Packages version/tag enumeration, writing each page directly to
    SQLite
  - fetches manifests only for package-version digests, then records known edges from those payloads
- Ingest architecture direction:
  - SQLite is the integration surface between ingest stages
  - avoid package-level in-memory aggregate models as the ingest contract
  - repeated paginated API ingestion should use one generic request -> normalize -> write pipeline, with per-endpoint
    hooks only where necessary
- Relational integrity direction:
  - add FKs by default and satisfy them via ingest order
  - only relax constraints later if a demonstrated ingest problem requires it
  - `tags(scan_id, version_id)` references `package_versions(scan_id, version_id)`
  - `manifests(scan_id, version_id)` references `package_versions(scan_id, version_id)`
  - `manifest_edges` remains known-to-known, with both endpoints referencing `manifests(scan_id, digest)`
  - missing referenced digests are derived from descriptor and subject references instead of being represented as
    manifest rows
- Current action shape: thin composite wrapper that invokes the shared CLI.
- Scan logging:
  - progress logs go to stderr
  - final scan summary JSON stays on stdout
  - supported levels: `debug`, `info`, `warn`, `error`, `silent`
- Debug helpers:
  - `GITHUB_TOKEN="$(gh auth token)" ghcr-manager scan --db <path> --owner <owner> --package <package> [--log-level <level>]`
    runs the live GitHub/GHCR scan directly via the CLI binary
- Working tree expectation at the end of the last session: clean after `e33d011`.
- Commit policy: do not commit agent changes until the user has reviewed and explicitly asked for a commit.
- File size guideline for production TypeScript:
  - up to about 100 lines is comfortable
  - above about 100 to 160 lines, strongly consider splitting
  - above about 160 to 220 lines, split unless cohesion is unusually strong
  - above about 220 lines is generally not acceptable outside repetitive or low-risk code
- Cross-folder import rule: imports from outside a folder must go through that folder's `index.ts`.
- Enforcement: the cross-folder `index.ts` rule is mechanically enforced by a local ESLint rule.
- File naming rule in `src/`: every non-public implementation file must be named `_*.ts`.
- Test mapping rule: `tests/` mirrors `src/` one-to-one, with `src/.../*.ts` mapped to `tests/.../*.test.ts`.

### Current Module Layout

```text
src/
  action/
  cli/
  core/
  db/
  ingest/
```

- `action/` contains the GitHub Action entrypoint only.
- `cli/` contains command dispatch and command-specific argument handling.
- `core/` contains stable shared types and planner logic.
- `db/` contains SQLite schema, database opening, and snapshot persistence/query code.
- `ingest/` contains live GitHub/GHCR ingest plus the internal file-fixture import helper used by tests.

## Current Direction

- Runtime and implementation language: TypeScript on Node.js.
- Repository shape: one project containing shared core logic, a local CLI, and a thin GitHub Action wrapper.
- Storage model: local SQLite database per run.
- Scope for the first usable increment: read-only package import and planning summary.

## Why TypeScript

- Keeps the future GitHub Action, CLI, and any later UI in one language.
- Avoids a likely split where the action is Node-based while the core is Python.
- Fits the product direction better than optimizing only for the fastest prototype.

## Narrow V1 Plan

1. Add a TypeScript project skeleton with build, lint, and test commands.
2. Add a SQLite schema plus a small repository layer for package versions, tags, manifests, and manifest edges.
3. Add a CLI with these initial commands:
   - `init-db`
   - `scan` using a local JSON snapshot file as the initial input source
4. Add a thin composite GitHub Action wrapper that invokes the same CLI.
5. Add focused tests for schema creation, import, and planning behavior.

## Non-Goals For This Increment

- Live GitHub API or GHCR ingestion.
- Deletion execution.
- Multi-package orchestration.
- Any UI beyond CLI and action wiring.
- Feature parity with existing cleanup actions.

## Progress Log

### 2026-04-28

- Decided to use TypeScript instead of Python after reviewing long-term product shape.
- Chosen first increment: real SQLite-backed core plus fixture-backed import flow.
- Added the initial TypeScript package, build scripts, and test setup.
- Added SQLite schema and repository modules for package scans.
- Added the first CLI commands: `init-db` and `scan`.
- Added a composite GitHub Action wrapper that invokes the shared CLI code.
- Added one representative package snapshot fixture and a planner test.
- Replaced Python-based Markdown and YAML linting with Node-native linting and formatting tools.

### 2026-04-29

- Strengthened the handoff documentation and made it the canonical session continuity record.
- Added a live `scan` path backed by the GitHub Packages API and GHCR manifest fetches.
- Normalized live package versions, tags, manifests, and edges into the existing SQLite-backed snapshot model.
- Added a focused ingest test covering tagged indexes, image child manifests, and referrer edges.
- Extended the planner fixture coverage so a tagged manifest graph now protects both child manifests and referrers.
- Refactored the flat `src/` layout into explicit `action`, `cli`, `core`, `db`, and `ingest` boundaries.
- Added ESLint enforcement for the rule that cross-folder imports must target folder `index.ts` entrypoints.
- Standardized internal source file names in `src/` so non-public implementation files use the `_*.ts` prefix.
- Mirrored `tests/` to `src/` one-to-one and added an enforced source-to-test mapping check.
- Settled the ingest direction for the next refactor: write remote results incrementally into SQLite instead of using
  package-level in-memory aggregate objects as the primary ingest boundary.
- Switched GHCR manifest reads to the registry bearer-token flow and split token acquisition into a dedicated internal
  client so public registries work without GitHub auth while authenticated reads remain available.
- Added CLI logging with explicit levels and periodic scan progress so long GitHub/GHCR imports are observable without
  corrupting stdout JSON output.
- Identified a remaining architectural inconsistency: package version pagination still buffers full result sets before
  writing, while manifest ingestion writes incrementally.
- Replaced the buffered package version path with a generic paginated ingest helper so version/tag enumeration now
  follows the same request -> normalize -> write shape as the rest of the DB-first ingest flow.
- Tightened the schema with foreign keys for `tags -> package_versions` and `manifest_edges -> manifests`, and aligned
  ingest order so manifests are written before edges.
- Improved GitHub and GHCR HTTP error reporting so upstream JSON messages, docs URLs, and auth-challenge headers are
  surfaced instead of only HTTP status codes.
- Tightened `tags` so each tag references a package-version row.
- Removed the low-value SQLite DDL/constraint-behavior checks from `tests/db/_schema.test.ts` and kept only an
  idempotence check for `initializeSchema(...)`.
- Added a `manifest_reachability(ancestor_digest, descendant_digest, min_distance)` table so future planner reads can
  use precomputed graph reachability instead of traversing raw `manifest_edges` at read time.
- Added `package_version_payloads(version_id, raw_json)` and `manifest_payloads(digest, raw_json)` as raw-payload master
  tables so upstream response items can be stored without lossy remapping.
- Split package-version metadata into `package_version_metadata(version_id, metadata_json)` so `package_versions` stays
  scalar and JSON-bearing fields live in dedicated side tables.
- Live GitHub/GHCR ingest now stores raw package-version item JSON and raw fetched manifest JSON in the payload tables
  alongside the normalized rows.
- Added `manifest_descriptors(parent_digest, child_digest, ...)` so descriptor rows discovered inside index manifests
  can be stored separately from directly fetched manifest documents in `manifests`.
- Live GitHub/GHCR ingest writes descriptor rows into `manifest_descriptors`; absent child or subject targets are
  derived by comparing those references against `manifests`.
- Added `docs/terminology.md` to map Docker/GHCR/OCI terms to this repo's DB tables and normalized manifest relations.
- Fetched manifest rows now also keep `config_media_type`, `subject_digest`, and `annotations_json` in `manifests` so
  common image-vs-artifact classification can be done without JSON-path expressions in every query.
- GHCR pull tokens are now cached per scan and reused until shortly before expiry; when the token response omits
  explicit expiry fields, the client falls back to a 60-second lifetime per the registry token spec.
- GHCR manifest fetches and GitHub package-version page fetches both use bounded parallelism; the tuning constants now
  live together near the code root in `src/tuning/index.ts`.
- GitHub package pages, GHCR manifest fetches, and GHCR token fetches now retry a small bounded number of times for
  transport failures and selected transient HTTP statuses before failing the scan.
- Removed the public `--source` / `--snapshot` scan mode split; the app now exposes only the real GitHub/GHCR scan path
  while keeping fixture loading in test-only helpers.

### 2026-05-14

- Added a derived `manifests.manifest_kind` helper field as best-effort debug classification without repeating
  media-type and JSON-path inspection in downstream SQL.
- Manifest classification now happens at GHCR manifest fetch time from the fetched document's media type, artifact
  markers, subject, and selected signature/attestation hints.
- Kept platform lookup out of the manifest kind classification scope; platform remains descriptor-context data.
- Updated the related-manifest SQL views to expose `manifest_kind` instead of `media_type` where the column was mainly
  being used as a human-facing manifest classification hint.

## Next Increment

1. Revisit whether `manifest_edges` should stay as a stored normalized table or become derived from descriptors plus
   referrer relations.
2. Improve planner output so it explains why versions are protected or deletable.
3. Add more planner tests for multi-arch images, referrers, and explicit tag exclusion cases.

### 2026-04-29 (multi-package schema layer)

- Added `package_scopes(scope_id, owner, package_name, last_scanned_at)` as the new package-level scope anchor.
- Scoped package-bound tables by `scope_id`: `package_versions`, `package_version_metadata`, `package_version_payloads`,
  and `tags`.
- Added `scope_manifests(scope_id, digest)` to associate globally deduplicated manifest rows with specific package
  scopes.
- Updated `ScanWriter` so `resetScan(packageName, scannedAt)` now clears and rewrites only the targeted scope instead of
  truncating all scan data in the DB.
- Updated `SnapshotRepository` queries to read from the latest scanned scope and apply `scope_id` filters to
  package-level counts and plan inputs.
- Follow-up needed: add a first-class scope selector API (explicit owner/package query target) so CLI and planner can
  choose among multiple stored scopes instead of always using the latest scan timestamp.

### 2026-04-29 (scan-history schema refactor)

- Replaced package-anchored tenancy with scan-anchored tenancy:
  - `package_scans(scan_id, scan_uuid, owner, package_name, scan_started_at, scan_completed_at, status)`
  - all snapshot tables now key and reference by `scan_id`.
- Updated writer persistence so `resetScan(...)` creates a new `running` scan row instead of truncating prior data.
- Added scan lifecycle updates in writer:
  - `markScanCompleted(...)`
  - `markScanFailed(...)`
- Updated GitHub and fixture ingest entrypoints to mark scan status transitions (`running -> completed|failed`).
- Updated snapshot repository and reachability rebuild logic to read/write by active/latest `scan_id`.
- Updated metadata naming and selection semantics:
  - code and outputs now use `scanCompletedAt` instead of `scannedAt`
  - repository metadata queries now select only completed scans (`status='completed'` with non-null completion time)

### 2026-04-29 (action vs CLI responsibility split)

- Decision: keep artifact upload behavior in the GitHub Action layer, not in the CLI/tool layer.

### 2026-04-29 (ingest options de-bloat)

- Tightened `GitHubScanOptions` to required scan inputs only: `owner`, `packageName`, `token`, and `logger`.
- Removed optional scan-option fields that were internal/test-only concerns: `githubApiBaseUrl`, `registryBaseUrl`,
  `username`, and `fetchImpl`.
- Moved transport/base-url overrides into an internal runtime argument on `importGitHubScan(...)` so tests can still
  inject fake HTTP without polluting the scan input contract.
- Required logger usage across ingest internals (removed optional logger chaining), matching CLI behavior.

### 2026-04-29 (missing-manifest query recipes)

- Operationally, GHCR scans can complete with missing manifests (HTTP 404). Ingest skips these and continues.
- Query recipes are documented in [docs/missing-manifests-queries.md](missing-manifests-queries.md).
- Rationale:
  - CLI should stay platform-agnostic and usable outside GitHub Actions.
  - GitHub-specific concerns (artifact retention, upload policy, conditional publish flags) belong to action wiring.
  - Composite action steps are a natural place for optional artifact upload; jobs are workflow-level, not action-level.
- Planned action shape:
  - Add optional action inputs (`upload-db-artifact`, `db-artifact-name`, `db-artifact-retention-days`).
  - Keep default behavior unchanged unless upload is explicitly enabled.
- Implemented in `action.yml`:
  - optional in-action DB artifact upload (off by default)
  - optional retention override (otherwise GitHub policy default is used)
  - scan DB path is derived internally from owner/package under runner temp storage (no `db-path` action input)
- Added `.github/workflows/manual-run.yml` as a `workflow_dispatch` validation workflow that:
  - accepts explicit `owner` and `package` inputs
  - runs `uses: ./` against the local action implementation
  - optionally uploads DB artifact via action inputs

### 2026-04-30 (scan UUID for merge-safe dedupe)

- [x] Added immutable `scan_uuid` on `package_scans` and started writing it on scan insert.
- [x] Added a scan-writer test assertion that new scan rows include UUID-formatted `scan_uuid`.

### 2026-04-30 (external SQL view loading)

- [x] Added SQL file loading from `resources/sql/schema/*.sql` and `resources/sql/views/*.sql` during schema
      initialization.
- [x] Added `v_missing_digests_related_manifests` as DB view SQL file under `resources/sql/views/`.
- [x] Added schema test coverage that the view is created by `initializeSchema(...)`.

### 2026-04-30 (npm publish with provenance)

- [x] Added project-local npm versioning defaults in `.npmrc`:
  - `tag-version-prefix=` so release tags are plain semver (no `v` prefix).
  - `message=Release %s` for clearer npm-managed release commit messages.
- [x] Added a package publish allowlist in `package.json` via `files` to ship only runtime artifacts and core docs.
- [x] Extended `.github/workflows/release.yml` with a `publish-npm` job that:
  - runs on semver tag pushes after existing validation checks
  - uses Node 24 with npm cache
  - runs `npm ci`, `npm test`, and `npm run build`
  - publishes with `npm publish --provenance --access public`
  - grants `id-token: write` for npm provenance/trusted publishing OIDC flow.
- [x] Wired GitHub release creation to depend on successful npm publish.

### 2026-04-30 (npm provenance metadata fix)

- [x] Added explicit npm package metadata in `package.json` for provenance validation:
  - `repository.url` set to `https://github.com/gh-workflow/ghcr-manager`
  - `homepage` set to the repository README URL
  - `bugs.url` set to the repository issues URL
- [x] Reason: npm provenance bundle verification requires `package.json` repository metadata to match GitHub Actions
      source repository information.

### 2026-05-03 (package-version-backed manifests)

- [x] Moved digest identity out of `package_versions` and onto `manifests`.
- [x] Refactored GHCR manifest ingest to fetch only package-version digests with bounded parallelism.
- [x] Kept `manifest_edges` strict for known-to-known manifest relations.
- [x] Kept missing-digest views derived from descriptor and subject payload fields.
- [x] Simplified manifest timestamp windows to the exact package-version timestamps for the same digest.
- [x] Updated GitHub ingest and DB writer code to match the new `package_versions -> manifests` version-id relation.

### 2026-05-10 (test registry image build reuse)

- [x] Extracted the test-registry architecture image build and smoke test into a local composite action.
- [x] Kept separate amd64 and arm64 build jobs so each architecture digest remains a deterministic job output for later
      manifest-combination jobs.
