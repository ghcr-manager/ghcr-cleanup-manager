# Implementation Notes

Active handoff notes for `ghcr-manager`.

Historical notes were compacted into [docs/implementation-notes.archive.md](archive/implementation-notes.archive.md).

## Session Handoff

- Developer glossary: [docs/terminology.md](terminology.md)

## Current Status

- Runtime: Node.js and TypeScript.
- Persistence model: local SQLite database per run.
- Core public surfaces:
  - CLI: `scan`, `cleanup`, `untag`
  - root action: `command: scan | cleanup | untag`
  - helper actions: `db-merge`, `merge-run-artifacts`
- Live package support:
  - org-owned and user-owned GitHub container packages
  - explicit owner-kind lookup through `GET /users/{owner}`
- Current test/workflow surfaces:
  - cleanup scenario executor + matrix workflows
  - direct untag executor + matrix workflows
  - dedicated cross-owner upstream repro workflows

## Current Release Track

- Focus now is cleanup, documentation, and first public release.
- No further cleanup-audit read surface is planned for now beyond repo-local tools and SQL views.

## Current Decisions

- Keep `README.md` user-facing only.
- Keep GitHub-specific artifact/upload policy in actions, not in the core CLI.
- Bedrock service values stay fixed and shared:
  - GitHub API base URL
  - GHCR registry base URL
  - GitHub API version
- `delete-tags` and `exclude-tags` on the root action are newline-separated.
- `untag` is a real public command and action mode:
  - it does not use a scan DB
  - it uses direct GitHub Packages + GHCR calls
  - it verifies postconditions after the rewrite/delete flow
- Direct untag live validation stays separate from cleanup scenarios.
- Untag live tests now use dedicated untag scenario IDs/package suffixes/tag prefixes so uploaded DBs are readable.
- Untag live tests reuse the shared seed implementation underneath rather than carrying a separate seed action.
- Test-only helper scripts now live under `tools/tests`; `tools/` root is reserved for runtime, repo-maintenance, and
  action-facing helpers.
- Older design-stage documents were archived from `docs/` into `docs/archive/`; active docs in `docs/` should describe
  the current product shape rather than early planning history.
- Upstream parity audit against `dataaxiom/ghcr-cleanup-action` commit range `87fa4bae..34a2b6c` found:
  - partial-image vs ghost-image split already matches upstream bugfix behavior
  - OCI 1.1 `subject` / referrer preservation is already represented in scan ingest, reachability, and cleanup planning
  - remaining hardening gap: `--use-regex` selectors are not pre-validated for pathological / ReDoS-prone patterns
- Scenario executor workflow note:
  - digest-selector scenarios require repo dependencies before pre-scan and digest resolution helper scripts run
- Test maintenance workflow note:
  - manual workflow `test_delete-test-org-packages.yml` deletes container packages from `GHCR_TEST_OWNER`, optionally
    filtered by a literal substring on package name
- User-owner workflow note:
  - `test_user-owner-cleanup.yml` now clears a fixed user-owned package, seeds two tagged images, deletes `delete-me`,
    uploads the post-cleanup DB artifact, and asserts the latest-scan view keeps only `keep-me`
- Untag seed note:
  - direct untag scenarios now use dedicated seed strategy IDs instead of borrowing cleanup scenario IDs for tag names
- Untag assertion note:
  - untag scenario verification now queries `v_latest_scan_per_package` directly instead of resolving latest scans in ad
    hoc helper logic
- Tagged cleanup seed note:
  - digest and wildcard tagged-delete scenarios now use dedicated seed strategy IDs instead of borrowing
    `tagged-fully-deletable`

## Current Action / DB Notes

- `scan` always uploads a DB artifact.
- `cleanup` always performs a pre-scan and may upload the resulting DB.
- `cleanup` only performs the post-mutation rescan when `scan-after-cleanup` is enabled.
- `cleanup` now emits one stable summary JSON shape for both dry-run and live execution:
  - it still prints JSON to stdout
  - the root action captures that JSON as an action output
  - the same JSON can be uploaded as a run artifact alongside the DB
  - the GitHub step summary is rendered from that same JSON
- `untag` does not support DB artifact upload.
- `db-merge`:
  - takes `source-db-dir` plus required `db-file`
  - creates the merged DB in a random temp directory
  - can upload the merged DB itself
  - exposes `db-path`, `artifact-id`, `artifact-url`, `artifact-digest`
- `merge-run-artifacts`:
  - collects current-run artifacts
  - calls `db-merge`
  - excludes the just-uploaded merged artifact from cleanup by artifact ID

## Current Schema / Audit Notes

- `package_scans.package_metadata_json` is required at scan-row creation time.
- `package_scans` and `cleanup_runs` both store nullable `github_actions_run_url`.
- `cleanup_runs` persists planner input/summary and links to the exact latest completed scan used.
- Cleanup audit persistence remains intentionally narrow:
  - `cleanup_runs`
  - `cleanup_root_decisions`
  - `cleanup_protected_root_blocks`
  - derived SQL views for closure/blocking reads

## Recent Checkpoints

- ☑ `3d20a13` Add cleanup run summaries to action output.
- ☑ `a5377c3` Unify action command summary output.
- ☑ `51f305a` Silence npm wrapper for action summary capture.
- ☑ `8cb45c0` Tighten cleanup step summary layout.
- ☑ `8bd644e` Remove DB artifact encryption support.
- ☑ `5884e13` Remove scan visibility ballast.
- ☑ `59c5520` Compact persisted planner inputs.
- ☑ `17ca89b` Remove stale schema doc link.
- ☑ `e548866` Split dedicated untag test scenarios.
- ☑ `2a942a5` Reuse shared seed action for untag tests.
- ☑ `5a1fd2e` Fix cleanup untag verification tests.
- ☑ `23bc6e3` Add direct untag test workflows.
- ☑ `0af3915` Add direct untag command support.
- ☑ `2b1452b` Move shared constants into config.
- ☑ `dd97037` Remove unused sequential paginated ingest helper.
- ☑ `6087883` Support user-owned GitHub container packages.
- ☑ `f42e4a6` Store scan package metadata and GitHub run URLs.
- ☑ `70a5dfb` Share DB artifact upload action.

## Current Next Plan

- [ ] Clean up remaining repo rough edges before first public release.
- [x] Remove built-in DB artifact encryption and decryption support across actions, workflows, and docs.
- [x] Remove active visibility ballast that only served the old encrypted-artifact model.
- [x] Reframe the doc-refactor task brief around layered user docs, action-first entry, and task-oriented DB guidance.
- [x] Add upstream attribution guidance to the doc-refactor brief for respectful reference without copy/replace/better
      framing.
- [x] Remove regex-based package filtering from the manual test-org package cleanup workflow.
- [x] Move untag scenario verification onto `v_latest_scan_per_package` and align the user-owner cleanup workflow with
      post-cleanup DB upload.
- [ ] Port regex selector validation hardening for `--use-regex` cleanup selectors.
- [x] Implement user-facing run output for `cleanup`:
  - stable cleanup summary JSON from the CLI
  - action `summary-json` output
  - optional cleanup JSON artifact upload alongside the DB
  - GitHub step summary rendering from that same JSON
- [ ] Update documentation for the first public release:
  - action usage
  - CLI usage
  - DB artifact / merge workflow
  - direct untag behavior and caveats
- [ ] Review release workflow and public-facing metadata before the first release tag.
