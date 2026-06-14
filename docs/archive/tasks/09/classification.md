# Task 09 Classification

Working notes for the first-pass classification of candidate tools in `../../GHCR-CLEANERS/`.

## How I classified

Prefer graph scenarios when a tool fits them well.

If a tool maps much better to a non-graph scenario, recommend that scenario instead.

Classes:

- `strong candidate`: worth deeper evaluation; best-fit scenarios are clear
- `possible candidate`: could be useful, but narrower or less aligned
- `drop`: unlikely to add much value

## Candidates

### `quartx-analytics/ghcr-cleaner`

- class: `drop`
- why:
  - explicitly handles truly untagged images
  - explicitly accounts for multiplatform dependencies
  - explicitly mentions provenance/attestation-related extra manifests
  - but it is a stale fork of `chizkiyahu/delete-untagged-ghcr-action`
  - repo last change was about 3 years ago
  - GitHub reports it as `25` commits ahead and `37` commits behind `chizkiyahu/delete-untagged-ghcr-action:main`
  - the org itself also looks effectively inactive for this purpose
- best-fit scenarios:
  - graph `2multiarch2tags` variants:
    - `base`
    - `attestations`
    - `cosign`
    - `cosign-attestations`
  - possible follow-up graph family: `2images1tag` if we add it
  - `delete-untagged` cases where dependency-aware behavior matters

=> exclude. Stale fork; prefer the active upstream-like repo `chizkiyahu/delete-untagged-ghcr-action`.

### `chizkiyahu/delete-untagged-ghcr-action`

- class: `strong candidate`
- why:
  - explicit multiplatform safeguard
  - optional signature deletion
  - broad owner/repo/package targeting
- best-fit scenarios:
  - graph `2multiarch2tags` variants:
    - `base`
    - `attestations`
    - `cosign`
    - `cosign-attestations`
  - possible follow-up graph family: `2images1tag` if we add it
  - cosign/referrer-related non-graph cases if graph mapping is awkward

### `vlaurin/action-ghcr-prune`

- class: `strong candidate`
- why:
  - flexible prune/keep filters
  - regex support
  - untagged pruning plus keep-last style retention
  - not especially graph-aware, but maps well to several existing cleanup selectors
- best-fit scenarios:
  - `wildcard-tagged-fully-deletable`
  - `regex-untag-only-single-shared-root`
  - `delete-untagged-real`
  - `delete-untagged-noop`
  - maybe `keep-n-tagged-overflow`

### `freke/github_docker_package_cleanup`

- class: `possible candidate`
- why:
  - age + keep-regex + protect-semver/latest is more policy cleanup than graph cleanup
  - still close enough to some retention cases
- best-fit scenarios:
  - `wildcard-tagged-fully-deletable`
  - maybe `keep-n-tagged-overflow`
- note:
  - interesting as a feature-idea source even if we do not wire it in

### `d22/cleanup-ghcr-containers-action`

- class: `possible candidate`
- why:
  - simple keep-latest-N behavior only
  - narrow surface
- best-fit scenarios:
  - `keep-n-tagged-overflow`

=> exclude. Repos last change was 5y ago.

### `duskmoon314/action-delete-ghcr-untagged`

- class: `drop`
- why:
  - only aged untagged deletion for one package
  - too narrow for the current suite
- best-fit scenario if forced:
  - `delete-untagged-real`

=> exclude. Repos last change was 3y ago, and it's a weak match.

### `frankdejonge/use-container-cleanup`

- class: `drop`
- why:
  - assumes semver-like numeric tag retention
  - too opinionated and not a good match for our scenario set

=> exclude. Repos last change was 2y ago, it's a weak match and probably not used except by its author.

## Recommended deeper pass

- `chizkiyahu/delete-untagged-ghcr-action`
- `vlaurin/action-ghcr-prune`
- maybe `freke/github_docker_package_cleanup`

## Deeper pass

### Current harness shape

- existing graph matrix scenarios are mostly explicit delete-tag operations
- but the graph family is still useful for `delete-untagged` evaluation because some seeded graph layouts already leave
  meaningful parts of the graph untagged
- `2multiarch2tags` is the clearest current example:
  - total shape still includes 3 images + 2 multiarch manifests
  - only `image-a` and `multiarch-a` stay directly tagged
  - that leaves a substantial untagged graph remainder to observe
  - the `attestations`, `cosign`, and `cosign-attestations` variants make this especially interesting
- the framework now has a generic per-scenario `executors` mapping and no longer needs one top-level field per executor
  flavor
- adding another executor is not just one workflow `uses:` line
- but adding a new executor no longer requires inventing another top-level scenario field just for that tool

### `chizkiyahu/delete-untagged-ghcr-action`

- best functional fit:
  - same broad area as `quartx`
  - untagged cleanup with optional multiplatform protection
  - optional deletion of matching signature tags
- important limits:
  - no delete-by-tag support
  - main useful mode for us is still `untagged_only: true`
  - `untagged_only: false` becomes package-wide delete-all and is not a good comparison target
- likely best scenarios:
  - `graph-2multiarch2tags-base`
  - `graph-2multiarch2tags-attestations`
  - `graph-2multiarch2tags-cosign`
  - `graph-2multiarch2tags-cosign-attestations`
  - `delete-untagged-real`
  - `delete-untagged-noop`
  - maybe the dedicated cosign-referrer scenarios if `with_sigs` looks worth comparing
- notable behavior detail:
  - dependency protection comes from `docker manifest inspect`
  - signature cleanup is opt-in and only for signature tags that match deleted digest names
- practical implication:
  - same as quartx: not a fit for graph delete-tag operations
  - but already meaningful on the existing `2multiarch2tags` graph family for `delete-untagged` behavior
- framework cost:
  - medium
  - same sort of executor plumbing as quartx
  - may not need brand-new graph base layouts to start
  - a `2images1tag` family would still be a useful follow-up because it gives a smaller, easier-to-explain
    `delete-untagged` graph case
- current implementation:
  - first-pass wiring added on:
    - `delete-untagged-noop`
    - `delete-untagged-real`
    - `graph-2multiarch2tags-base--delete-untagged`
    - `graph-2multiarch2tags-attestations--delete-untagged`
    - `graph-2multiarch2tags-cosign--delete-untagged`
    - `graph-2multiarch2tags-cosign-attestations--delete-untagged`
  - shared scenario assertions stay unchanged on purpose; mismatches are comparison signal

### `vlaurin/action-ghcr-prune`

- best functional fit:
  - existing non-graph cleanup scenarios
  - this is the cleanest match to the current harness without inventing new graph operations
- supports:
  - prune untagged
  - prune tags by regex
  - keep exact tags
  - keep tags by regex
  - keep younger than N days
  - keep last N matching versions
- likely best scenarios:
  - `delete-untagged-real`
  - `delete-untagged-noop`
  - `wildcard-tagged-fully-deletable`
  - `keep-n-tagged-overflow`
- weak or bad fits:
  - shared-root untag-only scenarios
  - graph delete-tag scenarios
  - digest-selector scenarios
  - ghost/partial/orphaned image scenarios
- notable behavior detail:
  - this tool deletes package versions, not specific tags off a shared version
  - so it should not be treated as an `untag-only-*` executor
- framework cost:
  - low to medium
  - add executor lane
  - add vlaurin-specific scenario input mapping
  - likely reuse existing non-graph scenarios instead of creating new ones
- current implementation:
  - first-pass wiring added on:
    - `delete-untagged-noop`
    - `delete-untagged-real`
    - `wildcard-tagged-fully-deletable`
    - `keep-n-tagged-overflow`
  - shared scenario assertions stay unchanged on purpose; mismatches are comparison signal

### `freke/github_docker_package_cleanup`

- best functional fit:
  - narrow non-graph policy cleanup cases only
- supports:
  - age threshold
  - protect IDs
  - protect by regex
  - keeps `latest`
  - keeps semver releases
  - targets untagged, non-semver tags, and prereleases
- likely best scenarios:
  - maybe `delete-untagged-real`
  - maybe a custom scenario shaped around branch/sha/prerelease tags
- weak fit to current suite:
  - not a natural fit for graph cases
  - not a natural fit for current keep-n cases
  - built-in semver/latest protection makes many comparisons policy-specific
- framework cost:
  - medium for a probably low-value comparison
- current recommendation:
  - leave out unless we decide to add a dedicated policy-cleanup scenario family

## Recommendation after deeper pass

- strongest next graph-oriented research candidate: `chizkiyahu/delete-untagged-ghcr-action`
  - start it on `graph-2multiarch2tags-*` plus `delete-untagged-real/noop`
  - optionally add a smaller `2images1tag` family afterward if we want an easier-to-read graph case
- strongest near-term non-graph add: `vlaurin/action-ghcr-prune`
  - best reuse of existing scenarios
  - lowest adaptation cost
  - first implementation now added on a small non-graph subset
- leave `freke/github_docker_package_cleanup` out for now

## Feature ideas spotted

- `chizkiyahu/delete-untagged-ghcr-action`
  - => no clear new feature idea
  - the optional cleanup of signature tags matching deleted digests overlaps with cleanup behavior we already cover
    through our existing graph-aware/orphaned cleanup surface
- `freke/github_docker_package_cleanup`
  - => no clear new feature idea
  - regex-style protection already exists for us
  - protect-by-ID did not look compelling enough from this review to treat as a follow-up idea
- `quartx-analytics/ghcr-cleaner`
  - => no follow-up; treat as stale fork rather than an active comparison target
