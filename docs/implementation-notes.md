# Implementation Notes

This document tracks the current implementation plan, decisions, and completed increments for `ghcr-manager`.

## Session Handoff

This section is the canonical place for session-to-session continuity.

### Completed Checkpoints

- ☑ `6899876` Add GHCR manager analysis and roadmap.
- ☑ `bc651cb` Add initial TypeScript project scaffold.
- ☑ `2483a75` Replace Python linting with Node-native tooling.

### Completed Plan

- ☑ Inspect current repo state and existing workflow assumptions for a TypeScript-based scaffold.
- ☑ Add lightweight project tracking docs for decisions, scope, and next increments.
- ☑ Scaffold minimal TypeScript project structure for shared core, CLI, and action entrypoint.
- ☑ Add initial SQLite schema/repository, fixture-backed scan flow, and planner summary.
- ☑ Add focused tests and update CI/lint configuration for the new stack.
- ☑ Run validation commands and summarize completed work plus next steps.

### Current Next Plan

- ☑ Add a real GitHub Packages and GHCR ingest adapter beside the fixture loader.
- ☑ Normalize live package, version, tag, manifest, and edge data into the existing SQLite schema.
- ☐ Expand planner output so it explains why versions are protected or deletable.
- ☐ Add tests for multi-arch images, referrers, and explicit tag exclusion behavior.
- ☐ Revisit action packaging after the live ingest path exists.

### Current State Summary

- Runtime: Node.js and TypeScript.
- Linting: ESLint, `eslint-plugin-yml`, `markdownlint-cli2`, and Prettier.
- Persistence model: local SQLite database per run.
- Current ingest sources:
  - local JSON snapshot fixture
  - live GitHub Packages plus GHCR manifest scan for one org-owned container package
- Current action shape: thin composite wrapper that invokes the shared CLI.
- Working tree expectation at the end of the last session: clean after `b902eda`.
- Commit policy: do not commit agent changes until the user has reviewed and explicitly asked for a commit.
- File size guideline for production TypeScript:
  - up to about 100 lines is comfortable
  - above about 100 to 160 lines, strongly consider splitting
  - above about 160 to 220 lines, split unless cohesion is unusually strong
  - above about 220 lines is generally not acceptable outside repetitive or low-risk code

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
   - `plan-summary`
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
- Added the first CLI commands: `init-db`, `scan`, and `plan-summary`.
- Added a composite GitHub Action wrapper that invokes the shared CLI code.
- Added one representative package snapshot fixture and a planner test.
- Replaced Python-based Markdown and YAML linting with Node-native linting and formatting tools.

### 2026-04-29

- Strengthened the handoff documentation and made it the canonical session continuity record.
- Added a live `scan --source github` path backed by the GitHub Packages API and GHCR manifest fetches.
- Normalized live package versions, tags, manifests, and edges into the existing SQLite-backed snapshot model.
- Added a focused ingest test covering tagged indexes, image child manifests, and referrer edges.
- Extended the planner fixture coverage so a tagged manifest graph now protects both child manifests and referrers.

## Next Increment

1. Replace or complement the snapshot-file scan path with a real GitHub Packages and GHCR ingest adapter.
2. Improve planner output so it explains why versions are protected or deletable.
3. Add more planner tests for multi-arch images, referrers, and explicit tag exclusion cases.
4. Revisit action packaging after the live ingest path exists.
