# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [v1.1.3] - 2026-07-01

### Changed

- Digest-tag helper edges now ignore self-references from a digest-tagged artifact back to its own manifest.
- The visualizer details view now shows `sha256-*` tags. These tags are still hidden in the graph itself.

### Fixed

- Visualizer docs and package-name references now consistently use `ghcr-cleanup-manager-visualizer`.

## [v1.1.2] - 2026-06-14

### Changed

- Reissued v1.1.1 as v1.1.2 after a partial publish to npmjs.com.

## [v1.1.1] - 2026-06-14

### Changed

- Shortened the root GitHub Action description so it stays under GitHub's marketplace 125-character limit.

## [v1.1.0] - 2026-06-14

### Changed

- Renamed the project from ghcr-manager to ghcr-cleanup-manager because the old repo name was not showing up in GitHub
  Marketplace searches for "ghcr clean" and "ghcr cleanup".
- Kept the current behavior unchanged for this release; this version is intended as the first release under the new
  name.

## [v1.0.8] - 2026-06-11

### Changed

- Marketplace-facing action metadata and README opening copy now lead more directly with GHCR cleanup terminology.
- User-facing docs and related metadata now use the product name `GHCR Cleanup Manager` more consistently.
- The main README's visualizer demo section now also points to Docker-based visualizer usage.

## [v1.0.7] - 2026-06-08

### Added

- Added a release-published Docker image for `ghcr-cleanup-manager-visualizer` on GHCR, tagged as `vX.Y.Z`, `vX`, and
  `latest`.

### Changed

- The visualizer release image now defaults to container-friendly startup behavior and is smoke-tested through the real
  server entrypoint during release publishing.

### Fixed

- Cleanup now blocks selected `sha-tag` helper roots when they still point into retained manifests, so signature helper
  artifacts needed by surviving images are no longer deleted as ordinary untagged roots.
- `exclude-tags` in cleanup is now tag-scoped instead of root-scoped, so excluding one sibling tag no longer silently
  protects the whole root from partial untagging.

## [v1.0.6] - 2026-06-07

### Fixed

- Fixed the published `ghcr-cleanup-manager-visualizer` npm package so the visualizer UI loads correctly when run via
  `npx ghcr-cleanup-manager-visualizer`.

## [v1.0.5] - 2026-06-07

### Fixed

- Fixed the published `ghcr-cleanup-manager-visualizer` npm package so `npx ghcr-cleanup-manager-visualizer` starts the
  visualizer server correctly.

## [v1.0.4] - 2026-06-06

### Added

- Added user-facing cleanup behavior documentation, including the tag-based protection model, graph-aware cleanup
  explanation, and digest-pull caveats.
- Added a visualizer grid toggle so graphs can be aligned for screenshots.

### Changed

- Visualizer screenshots and graph-related docs were refreshed.
- The visualizer graph area now uses a simpler, cleaner white background.
- Cleanup summary Markdown now uses an updated index icon label in its rendered output.

### Fixed

- Fixed the published `ghcr-cleanup-manager-visualizer` npm package so `npx ghcr-cleanup-manager-visualizer` runs
  correctly under Node.

## [v1.0.3] - 2026-06-05

### Changed

- Added npm package keywords for both `ghcr-cleanup-manager` and `ghcr-cleanup-manager-visualizer` to improve package
  discovery.

## [v1.0.2] - 2026-06-05

### Fixed

- Visualizer compare mode now prefers the older/base scan for manifest details and labels, so unchanged manifests keep
  platform metadata such as `arch:` even when the newer scan no longer has the descriptor context.

## [v1.0.1] - 2026-06-05

### Fixed

- The GitHub release job now grants correct permissions.

## [v1.0.0] - 2026-06-05

`v1.0.0` is the first stable `v1.x` release of `ghcr-cleanup-manager`.

This milestone reflects the current project shape after repeated live testing, cleanup-planner tuning, visualizer
refinement, and a full documentation pass.

### Added

- Added one merged graph-scenario SQLite database to the GitHub release assets as
  `ghcr-cleanup-manager-release-scenarios.sqlite`, so users can explore real before/after cleanup cases immediately in
  the visualizer.
- Added dedicated user docs for live test scenarios, package setup, and the workflow-to-visualizer path.

### Changed

- The release workflow now builds and attaches the merged scenario DB as part of the GitHub release publish flow.
- Visualizer docs are now centered on one canonical `visualizer/README.md`, with richer screenshots and a release-asset
  quick-demo path.
- README and companion docs now explain the stable action/CLI/visualizer workflows more directly, including permission
  guidance for dry-runs versus live cleanup and explicit Node.js 24 requirements for local npm installs.
- Visualizer node labeling was clarified so manifest metadata is easier to interpret during graph inspection.

## [0.9.10] - 2026-06-04

### Changed

- Cleanup planning for large package databases is much faster while preserving the existing cleanup behavior.
- On a large validation package with more than 100k manifests, dry-run planning and summary generation dropped from more
  than 20 minutes to roughly 15 seconds.

### Fixed

- Internal GHCR validation workflows now avoid GitHub's "cannot delete the last tagged version" failure mode during
  temporary-tag cleanup.

## [0.9.9] - 2026-05-30

No additional user-facing changes were introduced beyond `0.9.8`.

This version number exists because a release attempt consumed `0.9.9` on npm.org, so later publishes must continue from
a newer version.

## [0.9.8] - 2026-06-03

### Added

- Added dedicated graph-matrix GHCR scenarios and workflows to exercise shared-image, multi-arch, cosign, and
  attestation cleanup cases in isolation.
- Added a local manifest-graph visualizer with browser UI for `ghcr-cleanup-manager` SQLite databases, including
  manifest details, zoom controls, one-hop expansion, and scan-to-scan compare mode.
- Added a separately publishable npm package, `ghcr-cleanup-manager-visualizer`, plus user-facing visualizer
  documentation.
- Added repo-local manual visualizer demo scripts for seeding and updating GHCR packages during graph investigation.

### Changed

- Cleanup planning was reworked around the current graph model, including direct SQL-backed tagged/untagged root
  selection, graph-scoped closure walking, and refined `untag-only` vs `fully-deletable` decisions for complex
  multi-arch, cosign, and attestation shapes.
- Large planner SQL bodies were split into smaller internal modules, and direct-target root selection logic was split
  into smaller planner helpers.
- Orphaned digest-tag resolution now uses a direct latest-scan query instead of relying on older helper views.
- Manifest platform display now derives from descriptor data in the visualizer instead of relying on manifest-level
  platform fields.
- Cross-architecture terminology is now consistently named `multi-arch` across runtime, tests, and docs.
- The root action and public CLI surface are now centered on `scan` and `cleanup` only.

### Fixed

- Fixed digest-tag helper-edge direction and root-detection behavior so helper-tagged artifacts no longer interfere with
  normal cleanup root semantics.
- Fixed shared-graph cleanup handling so selected indexes and helper-linked artifacts are deleted or retained according
  to surviving real tags instead of simplistic descendant-only closure rules.

### Removed

- The public `untag` CLI command, root-action mode, and dedicated direct-untag workflow coverage were removed. Internal
  tag detachment for partial-tag cleanup matches remains part of `cleanup`.
- Several older cleanup helper views were removed after the planner rewrite moved the live logic into direct SQL query
  paths.

## [0.9.7] - 2026-05-23

### Added

- The root action now prepares `cleanup` and `untag` CLI arguments through `tools/prepare-action-args.mjs`, keeping
  printed and executed argument lists aligned.
- Cleanup planning now traverses recursively beyond `sha256-*` helper-tag manifest links as well, if deeper helper
  chains ever occur.

### Changed

- Cleanup dry-run output and GitHub step summaries were reworked to explain the plan more clearly, including a filters
  table and clearer counts for tags, images, and cross-arch manifests.
- Informational manifest classification was tuned so only real multi-arch roots are labeled `multi_arch_manifest`, while
  helper-tagged indexes remain `index_manifest`.
- `merge-run-artifacts` now uses a simpler current-run download flow with direct artifact download handling.
- Cleanup selected-tag audit and DB-merge metadata handling were tightened alongside the summary/output refactor.

### Fixed

- `delete-orphaned-images` now carries orphaned `sha256-*` digest-tag targets through planner selection instead of
  dropping them at the normal non-digest tag boundary.
- Fully deletable cleanup execution now deletes the planned closure package versions instead of deleting only the root
  package version.

## [0.9.6] - 2026-05-21

### Added

- Cleanup audit now persists concrete selected tags in `cleanup_selected_tags`.
- Cleanup schema docs now include a readable cleanup-decision view plus example SQL queries for audit inspection.
- GHCR digest-tag helper relations are now modeled explicitly in scan data and manifest reachability.

### Changed

- Cleanup summary JSON now exposes derived affected manifests for fully deletable roots.
- Cleanup Markdown now reads displayed counts from the summary arrays instead of carrying duplicate count fields.
- Cleanup decision audit fields are now constrained more tightly in SQLite and TypeScript, including `selection_mode`,
  `selection_reason`, and related block reason codes.
- Digest-tag helper artifacts are now classified on `tags.is_digest_tag` and excluded from normal user-facing tag
  selection and output.
- Digest-tag helper terminology was simplified across code and SQL surfaces.
- Schema docs now include a table of contents and collapsible example query blocks for easier GitHub browsing.

### Fixed

- Fixed remote action path handling for artifact upload and merge helper actions.
- Cleanup reachability now follows digest-tag helper edges recursively, matching helper-artifact cascades more closely.

## [0.9.5] - 2026-05-21

### Changed

- Renamed `upload-db-artifact` to `upload-artifacts`.
- Raised cleanup summary defaults to 100 matched tags and 100 roots per section.

## [0.9.4] - 2026-05-21

### Changed

- The root action now exposes `summary-json-path` instead of `summary-json`, so command summaries are consumed by file
  path rather than as a large action output payload.

### Fixed

- The GitHub Action now passes cleanup and untag summary JSON between steps by file path instead of large environment
  payloads, avoiding GitHub template-memory and argument-length failures on large cleanup runs.

## [0.9.3] - 2026-05-21

### Changed

- Cleanup selector planning now composes tagged and untagged selector families in one SQL-backed planner path.
- Cleanup CLI help and docs now describe the composed selector model, including tagged selectors combined with
  `delete-untagged`.

### Fixed

- `exclude-tag` now works correctly when a tagged selector family is combined with `delete-untagged`.

## [0.9.2] - 2026-05-21

### Changed

- The action input is now `token`, and the repo now uses `GITHUB_TOKEN` consistently in docs and helper scripts.

## [0.9.1] - 2026-05-21

### Fixed

- The GitHub Action now installs, builds, and runs from its own checkout path instead of the caller repository path.

## [0.9.0] - 2026-05-21

`0.9.0` is the first stable pre-`1.0` release of `ghcr-cleanup-manager`.

### Added

- `cleanup` as the main GHCR maintenance flow for both the GitHub Action and the companion CLI.
- `untag` as a direct tag-removal mode that works without a scan database.
- `db-merge` and `merge-run-artifacts` support for combining scan databases across packages and workflow runs.
- Support for both organization-owned and user-owned GitHub Container Registry packages.
- Cleanup summary JSON output plus GitHub step summary rendering for action runs.
- Broad live and scenario-based workflow coverage for cleanup, untag, and cross-owner behavior.
- User-facing documentation for action usage, CLI usage, DB merge workflows, schema orientation, and SQL recipes.

### Changed

- The GitHub Action now builds and runs the repo-local CLI directly instead of installing `ghcr-cleanup-manager` from
  npm at runtime.
- The primary maintenance surface is now `cleanup` with `dry-run` semantics, with `scan` and `untag` as supporting
  command modes.
- The action input and artifact flow were refined around scan databases, cleanup summaries, and optional post-cleanup
  rescan behavior.
- Documentation was reorganized around action-first usage, with deeper companion docs for CLI and database workflows.
- Release validation and workflow gating were tightened around exact version references, changelog readiness, and live
  scenario checks.

### Removed

- Built-in database artifact encryption and decryption support.

### Fixed

- Digest-selector scenario handling and related workflow wiring for `ghcr-cleanup-manager`.
- Latest-scan based verification for cleanup and untag test flows.
- User-owner cleanup workflow behavior and related test setup details.
- Numerous workflow, artifact-handling, and planner-audit edge cases discovered during pre-release hardening.

## [0.0.6] - 2026-04-30

### Changed

- Internal workflow/debug wiring.

## [0.0.5] - 2026-04-30

### Changed

- Publish to npmjs by trusted publisher

## [0.0.4] - 2026-04-30

### Changed

- Publish to npmjs

## [0.0.3] - 2026-04-30

### Changed

- Released on GitHub marketplace as public action

## [0.0.1] - 2026-04-30

### Added

- Initial public release of `ghcr-cleanup-manager` as a GitHub Action plus companion CLI.
- GHCR scan flow that loads package versions, tags, manifests, descriptors, and manifest graph edges into SQLite.
- Manifest reachability precomputation (`manifest_reachability`) for fast graph-based analysis queries.
- Raw payload storage for GitHub package-version items and GHCR manifests (`package_version_payloads`,
  `manifest_payloads`).
- Scan lifecycle tracking with scan history (`package_scans`) and status transitions (`running|completed|failed`).
- Immutable per-scan UUID (`package_scans.scan_uuid`) for robust duplicate detection across merged databases.
- Optional action artifact upload for scan DB export (`upload-db-artifact`, optional retention override).
- Manual workflow for interactive scan runs (`.github/workflows/manual-run.yml`).
- Missing-manifest investigation SQL recipes (`docs/queries/missing-manifests-queries.md`) and schema/terminology docs.

### Changed

- Enforced stricter repository conventions:
  - source/test tree mirroring
  - cross-folder imports via folder `index.ts`
  - internal source naming (`_*.ts`)
- Hardened CI/workflows with explicit token permissions and immutable action reference checks.
- Refined action/runtime flow to focus on scan + DB export behavior for this release.
