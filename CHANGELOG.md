# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

`0.9.0` is the first stable pre-`1.0` release of `ghcr-manager`.

### Added

- `cleanup` as the main GHCR maintenance flow for both the GitHub Action and the companion CLI.
- `untag` as a direct tag-removal mode that works without a scan database.
- `db-merge` and `merge-run-artifacts` support for combining scan databases across packages and workflow runs.
- Support for both organization-owned and user-owned GitHub Container Registry packages.
- Cleanup summary JSON output plus GitHub step summary rendering for action runs.
- Broad live and scenario-based workflow coverage for cleanup, untag, and cross-owner behavior.
- User-facing documentation for action usage, CLI usage, DB merge workflows, schema orientation, and SQL recipes.

### Changed

- The GitHub Action now builds and runs the repo-local CLI directly instead of installing `ghcr-manager` from npm at
  runtime.
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

- Digest-selector scenario handling and related workflow wiring for `ghcr-manager`.
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

- Initial public release of `ghcr-manager` as a GitHub Action plus companion CLI.
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
