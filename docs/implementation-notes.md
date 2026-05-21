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
- Release packaging stays source-only in Git:
  - do not commit `dist/` to `main`
  - do not create workflow-managed release commits that add `dist/`
  - keep the tag-push release model and let the action/npm paths build or install at runtime as they do today
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
- Scenario workflow concurrency note:
  - cleanup scenario execution is serialized per `scenario + executor`
  - untag scenario execution is serialized per `scenario`
  - user-owner cleanup now has its own dedicated concurrency group because it mutates one fixed package
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
- Cleanup selector composition note:
  - cleanup direct-target root selection now goes through one SQL-backed planner path
  - selector predicates are composed in SQL, then tagged/untagged keep-overflow ranking is applied in later SQL stages
  - tagged selector families may now be combined with `delete-untagged`
  - `keep-n-untagged` remains incompatible with `delete-untagged`
  - the older planner helper layer for separate tagged/untagged root-target selection was removed after the SQL
    composition refactor so `src/db/planner` reflects the live repository path instead of carrying dead adapters
- Coverage note:
  - CLI dispatch, cleanup-summary markdown branches, and planner repository wrapper methods now have explicit tests so
    post-refactor line coverage reflects the live surface more closely
- Action summary handoff note:
  - command summary JSON is now handed across action steps by file path instead of large env/expression payloads
  - this avoids GitHub template-memory and argument-length failures on large cleanup summaries
  - the root action now exposes `summary-json-path`, not the full summary JSON payload, to avoid GitHub output-size
    limits on large cleanup runs

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
  - action summary JSON file-path output
  - optional cleanup JSON artifact upload alongside the DB
  - GitHub step summary rendering from that same JSON
- [x] Update documentation for the first public release:
  - action usage
  - CLI usage
  - DB artifact / merge workflow
  - direct untag behavior and caveats
- [ ] Revisit DB/schema onboarding later with example-driven guidance if release feedback shows users need it.
- [ ] Review release workflow and public-facing metadata before the first release tag.

## Current Documentation Notes

- Release-facing docs should be layered:
  - `README.md` as action-first quick start and orientation
  - action-run summary output as the first cleanup review surface
  - DB/schema docs as the deeper second layer
- Task 03 changed the recommended first-run inspection flow:
  - `cleanup` dry-run understanding should start from the GitHub step summary or `summary-json-path`
  - DB inspection is still important, but no longer the primary first-run entry path
- Do not maintain a checkpoint commit list here. Squash/rebase workflows make that log noisy and force unnecessary
  follow-up commits.
- Active user-doc split:
  - `README.md` for action-first entry
  - `action-usage.md` for the root action
  - `db-merge-workflows.md` for multi-package workflows and combined DBs
  - `cli-usage.md` for the secondary local CLI surface
  - `schema-description.md` for DB orientation
  - `queries/missing-manifests-queries.md` for a narrow advanced SQL recipe
- Keep internal planner/semantics notes out of the user-facing doc path.
- Task 04 is effectively complete for now. DB/schema explanation remains intentionally deferred rather than blocking
  release docs.
- Release workflow note:
  - release remains tag-driven
  - the release workflow triggers only for full release tags like `0.9.0`, not shorthand major tags like `0`
  - after a successful release, the workflow force-moves the major shorthand tag (for example `0`) onto the same commit
  - release now requires these workflow-backed live checks before npm publish and GitHub release:
    - `test_scenario-executor-matrix.yml` with `executors: ghcr-manager`
    - `test_user-owner-cleanup.yml`
    - `test_untag-matrix.yml`
  - release tag / version / changelog verification now runs before those live checks so obvious release-prep mistakes
    fail fast
  - `test_scenario-executor-matrix.yml` and `test_user-owner-cleanup.yml` now run in parallel, then
    `test_untag-matrix.yml` runs last so its SQLite artifact bundling sees both earlier runs
  - release validation now checks that the tag commit is on `main`
  - release validation checks `README.md` and `.github/workflows/manual-run_scan.yml` for exact action refs
  - `CHANGELOG.md` must already contain the concrete release heading before tagging
