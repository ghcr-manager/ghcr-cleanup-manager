# Implementation Notes

Active handoff notes for `ghcr-manager`.

Previous handoff material was archived to
[docs/archive/implementation-notes.archive2.md](archive/implementation-notes.archive2.md).

## Session Handoff

- Developer glossary: [docs/terminology.md](terminology.md)
- Previous handoff archive: [docs/archive/implementation-notes.archive2.md](archive/implementation-notes.archive2.md)

## Current Checklist

- [x] Close and archive the previous implementation-notes handoff.
- [x] Complete the cleanup/planner rethink, graph-matrix scenario work, and visualizer first-pass refinement.
- [x] Start the next active implementation task and record it here before substantial changes begin.
- [x] Apply graph-scoped `graph_id` narrowing to blocked-roots planner SQL.
- [x] Measure the updated blocked-roots query on the large large test package DB dry-run workload.
- [x] Optimize combined direct-target-root planning to avoid broad edge and tag pre-aggregation.
- [x] Evaluate `ghcrctl` as an optional third graph-matrix executor.
- [x] Limit `ghcrctl` support to graph-matrix scenarios with exactly one delete-tag target.
- [x] Add minimal workflow support for one-call `ghcrctl delete graph --tag` execution.
- [x] Add separate test-facing docs for scenarios and the workflow-to-visualizer path.
- [x] Add release-DB quick-demo notes to the visualizer doc and main README.
- [x] Add one visualizer screenshot to the README quick-demo section.
- [x] Collapse visualizer docs to one canonical `visualizer/README.md`.
- [x] Refresh user-facing docs for release readiness:
  - add explicit action permission guidance for dry-run vs live cleanup
  - add Node.js 24 requirements to CLI and visualizer install docs
  - align terminology docs with current manifest kinds and edge kinds
  - fix small prose issues in the workflow-to-visualizer doc
- [x] Align release docs and workflow with the planned `v1.0.0` tag style.

## Current Next Plan

- No active follow-up is pending.
- If `ghcrctl` matrix runs reveal mismatches worth documenting, summarize those per-scenario rather than broadening the
  adapter surface.

## Current Status

- Runtime: Node.js and TypeScript.
- Persistence model: local SQLite database per run.
- Core public surfaces:
  - CLI: `scan`, `cleanup`
  - root action: `command: scan | cleanup`
  - helper actions: `db-merge`, `merge-run-artifacts`
- Current major areas already in place:
  - cleanup/planner rethink and current graph-based deletion behavior
  - graph-matrix scenario workflows and test harness
  - optional `ghcrctl` graph-matrix executor for single-tag graph deletions
  - local `visualizer/` workspace for manifest-graph inspection
  - basic live-test documentation in `docs/test/scenarios.md`, `docs/test/package-setup.md`, and
    `docs/test/matrix-workflow-to-visualizer.md`
  - release assets now include a merged scenario DB that can be used as a ready-made visualizer demo
  - visualizer docs now live only in `visualizer/README.md`

## Current Decisions

- Keep `README.md` user-facing only.
- Keep GitHub-specific artifact/upload policy in actions, not in the core CLI.
- Release packaging stays source-only in Git:
  - do not commit `dist/` to `main`
  - do not create workflow-managed release commits that add `dist/`
- Visualizer packaging stays separate from the main package.
- Task and handoff history should be archived rather than left as stale active notes in `docs/`.
- Release tags use `v`-prefixed semver such as `v1.0.0`.
- `package.json`, `visualizer/package.json`, and changelog headings now also use the same `v`-prefixed semver format.
- Use `graph_id` narrowing in planner SQL where the workload is already graph-scoped; do not denormalize `graph_id` into
  `manifest_reachability` before measuring query-level gains.
- Prefer indexed per-root `EXISTS` and `COUNT` lookups over broad pre-aggregating CTEs when large-table scans dominate
  planner runtime.
- `ghcrctl` support stays graph-matrix-only and single-target-only:
  - no mixed cleanup matrix support
  - no multi-tag scenario support
  - no multi-call mapping to emulate one scenario
  - executor outcome mismatches are valid comparison signal, not an adapter bug by default
