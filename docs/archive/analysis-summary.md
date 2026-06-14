# GHCR Cleanup Analysis Summary

## Context

This project started from investigating slow GHCR cleanup runs in two existing repositories:

- `aicage/aicage-image-base`
- `aicage/aicage-image`

Both use `dataaxiom/ghcr-cleanup-action`. The smaller package took more than 30 minutes. The larger package timed out
after more than 6 hours.

The pain point is not just cleanup policy. Large GHCR packages are also hard to inspect and understand with the GitHub
UI alone, so a tool that can ingest package state and support local analysis is useful even outside GitHub Actions.

## Main Conclusions

### 1. Full package loading is required

For safe GHCR cleanup, especially with multi-arch images and referrers, a correct implementation needs to load:

- all relevant package versions
- all relevant tags
- essentially all manifests or enough manifests to reconstruct the full dependency graph

The package API alone is not enough to decide what is safe to delete.

### 2. Stateless runs are acceptable

A weekly throwaway run in GitHub Actions is a reasonable model.

The core problem with the existing action is not that it scans everything each run. The real problem is that the
implementation becomes inefficient after loading the data.

### 3. The existing implementation is safety-first but inefficient at scale

`dataaxiom/ghcr-cleanup-action` has the right correctness goal, but its implementation is expensive for very large
packages:

- it loads all package versions
- it fetches manifests across the package
- it stores transient state in JS maps and sets only
- it performs additional passes after ingest
- some later passes are effectively worse than linear
- it emits large `info` logs, which increases runtime further
- deletion itself is also slow and constrained by GitHub rate limiting

So the issue is not "full scan bad". The issue is "full scan plus repeated expensive passes plus slow deletion".

### 4. In-memory processing can work, but a DB is a better implementation substrate

A pure RAM implementation could be fast enough if it is:

- index-driven
- near-linear after ingest
- careful about repeated scans
- conservative about logging
- bounded in concurrent I/O

However, for maintainability and development sanity, a local database is the better choice here. It makes it much easier
to:

- model package versions, tags, manifests, and graph edges explicitly
- inspect intermediate state
- debug retention logic
- iterate on queries without rewriting nested loops

The DB does not need to be persistent at first. Even an ephemeral SQLite database created during a run is a major
improvement over large transient JSON or ad hoc in-memory object graphs.

## Existing Actions Reviewed

### Base reference: `dataaxiom/ghcr-cleanup-action`

This is the main reference implementation because it is trying to solve the right safety problem:

- manifest-aware cleanup
- multi-arch handling
- referrer / attestation awareness
- several retention modes

It is the best source for:

- expected cleanup behavior
- edge cases
- test ideas
- compatibility ideas for inputs such as `older-than`, `delete-untagged`, and `exclude-tags`

It is not a good architectural base for a DB-first redesign. If this project follows the current plan, only the
behavioral ideas and edge-case knowledge should be reused, not the main implementation structure.

### Similar action: `jenskeiner/ghcr.io-container-repository-cleanup-action`

This action appears to use a similar manifest-aware approach. It is useful as another behavior reference, but it does
not solve the main architectural concern if the goal is a cleaner, queryable local model.

### Other references

`actions/delete-package-versions`

- useful as a GitHub-maintained reference
- not sufficient for this use case
- limited and not suitable as the main implementation approach for safe large GHCR cleanup

`snok/container-retention-policy`

- useful reference for rate-limit and retention-policy tradeoffs
- helpful for understanding deletion throughput limits
- not the desired base if the goal is safe graph-aware cleanup without manual workarounds

## Repository Decision

The tool should live in one repository for now:

- core logic
- CLI
- GitHub Action wrapper

The action is one interface for the tool, not the whole project.

Current chosen name:

- `ghcr-cleanup-manager`

Current short description:

- `Inspect, analyze, and manage GitHub Container Registry packages`

## Path Forward

## Phase 1: Minimal Product Shape

Build one project with three layers:

1. Core ingest, indexing, planning, and deletion logic
2. CLI for local development and debugging
3. GitHub Action wrapper for public workflow use

Keep the boundaries clean enough to support a future UI, but do not build UI work into the first version.

## Phase 2: Data Model

Use SQLite first.

Suggested core tables:

- `package_versions`
  - package version ID
  - digest
  - timestamps
  - tag counts or tagged state
  - raw metadata as needed
- `tags`
  - tag
  - digest
- `manifest_edges`
  - parent digest
  - child digest
  - edge kind such as image child or referrer
- `manifests`
  - digest
  - media type
  - artifact type
  - architecture / variant where useful

Use explicit indexes rather than repeated scans through transient object graphs.

## Phase 3: First Feature Set

The first public version should stay intentionally narrow:

- one package at a time
- organization-owned GHCR packages
- full scan per run
- dry-run mode
- `older-than`
- `delete-untagged`
- `exclude-tags`
- safe multi-arch child handling
- safe referrer / attestation handling
- structured summary output

Avoid early scope creep:

- no feature-parity chase with every existing action
- no complex untagging modes initially
- no multi-package orchestration initially
- no UI in v1

## Phase 4: Execution Model

Recommended execution flow:

1. Load package versions from the GitHub Packages API
2. Fetch manifests from GHCR
3. Normalize everything into SQLite
4. Compute protected and deletable digests using queries plus a small amount of planner logic
5. Execute deletions by package version ID
6. Emit a compact machine-readable and human-readable summary

This keeps the correctness model from the existing manifest-aware actions while making the implementation much easier to
reason about and evolve.

## Phase 5: Action Packaging

Publish the GitHub Action from this same repository.

The action should be a thin wrapper around the core tool:

- accept workflow inputs
- invoke the same planner / deletion engine used by the CLI
- report dry-run and execution summaries

That avoids building an "action-only" implementation that later diverges from the local tooling.

## Why Not Just Fork the Existing Action

Forking `dataaxiom/ghcr-cleanup-action` would make sense for a small tactical patch, but it is not the right shape for
the current plan because:

- the implementation model is the thing being questioned
- a DB-first design leaves little of the original structure intact
- the upstream appears inactive
- publishing a new action is cleaner than asking users to depend on a personal fork

So the recommended direction is a new implementation, using existing actions mainly as behavior references.

## Immediate Next Steps

1. Define the runtime and implementation language.
2. Write a tiny schema and ingest prototype against one real GHCR package.
3. Build a read-only CLI command that imports package data and prints basic counts.
4. Add a query or planner command that identifies protected versus deletable digests.
5. Only then add delete execution and the GitHub Action wrapper.
