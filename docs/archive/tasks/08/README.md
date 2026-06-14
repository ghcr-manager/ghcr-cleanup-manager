# 08 Task: Evaluate 'ghcrctl' as 3rd Scenario Executor

## Status

We already use 2 cleanup executors in our live GHCR scenario tests:

- `ghcr-cleanup-manager`
- `dataaxiom/ghcr-cleanup-action`

That has been useful because it gives us a second implementation to compare against. In many cases the comparison helps
us spot where our own logic differs, where the other tool has different assumptions, and where the topic itself is more
ambiguous than it first looks.

Now there is a possible 3rd tool with overlapping focus:

- local clone: `../../mkoepf/ghcrctl`

This task is not about forcing `ghcrctl` into all our test workflows.

It is only about checking whether `ghcrctl` fits naturally into parts of our existing scenario framework, especially the
graph-matrix scenarios.

## Core idea

`ghcrctl` looks interesting because it is graph-aware and explicitly talks about:

- OCI graphs
- shared manifests across graphs
- attestations
- signatures
- deleting full graphs by tag, digest, or version

That overlaps most with our graph-matrix scenarios, where we intentionally build graph shapes step by step and then run
simple tag-driven cleanup operations against them.

The older mixed cleanup scenario matrix is less attractive as a target because many of those scenarios exist mainly to
exercise the specific feature surface of:

- `ghcr-cleanup-manager`
- `ghcr-cleanup-action`

Examples:

- untag-only behavior
- keep/exclude logic
- ghost / partial / orphaned image cleanup
- combined selector behavior

Those are useful for our own tool comparisons, but they are not necessarily a natural fit for `ghcrctl`.

## Goal

Find out whether `ghcrctl` can be used cleanly as a 3rd executor for at least a meaningful subset of the graph-matrix
scenarios.

The bar is:

- use it where it fits naturally
- do not use it where we need awkward workarounds
- do not distort existing scenarios just to make them fit `ghcrctl`
- do not bloat the test framework for a marginal gain

## Non-goals

This task is not:

- forcing feature parity across all 3 tools
- making `ghcrctl` work for the older mixed cleanup matrix
- inventing artificial adapter logic just to claim broader support
- changing scenario intent so that `ghcrctl` can participate

## What “good fit” means

A scenario is a good fit for `ghcrctl` if:

- the cleanup operation maps directly to a clear `ghcrctl` command
- the scenario intent stays the same
- executor-specific translation can stay small and local
- the result comparison remains meaningful

Likely examples:

- graph-matrix rows that delete exactly one tagged graph
- simple fully deletable tag-based cleanup rows
- maybe simple delete-untagged rows

A scenario is not a good fit if:

- it depends on untag-only behavior
- it depends on keep/exclude semantics
- it depends on ghost / partial / orphaned image logic
- it needs several workaround commands to emulate one cleanup intent
- it only “works” if we reinterpret the scenario instead of executing the same intent

## Why graph-matrix first

The graph-matrix scenarios are the best place to evaluate this because:

- their structure is regular
- their graph growth is deliberate and understandable
- the cleanup operations are simple tag-based deletes
- they are already the scenarios where graph behavior matters most

That makes them a better fit than the older executor matrix, which mixes more feature-specific cleanup semantics.

## Existing framework shape

The scenario framework already supports executor restriction per scenario via `supportedExecutors`.

Relevant files:

- `.github/workflows/test_scenario-executor-matrix.yml`
- `.github/workflows/test_scenario-graph-matrix.yml`
- `.github/workflows/test_scenario-executor.yml`
- `tools/tests/test-scenarios/_definitions.mjs`
- `tools/tests/test-scenarios/_graph-scenarios.mjs`
- `tools/tests/test-scenarios/_cleanup-scenarios.mjs`

So adding `ghcrctl` to only some scenarios should be structurally easy.

The more important question is whether translating a scenario into `ghcrctl` arguments can be kept clean and
encapsulated.

## Preferred integration shape

If `ghcrctl` is adopted at all, prefer:

- one dedicated executor name
- one dedicated executor branch in the reusable scenario workflow
- one small repo-local translation layer for `ghcrctl`

Avoid:

- mixing `ghcrctl` details into unrelated executor config
- overloading `dataaxiomInputs` with a third tool’s semantics
- scattering special cases throughout many workflow steps

If needed, a small helper script like `resolve-ghcrctl-command` is acceptable.

That helper should decide:

- whether the scenario is supported
- which command to run
- whether one command is enough or not

But if that helper starts becoming a logic maze, that is a sign the scenario does not fit well enough.

## Concrete questions to answer

1. Which graph-matrix scenarios map cleanly to `ghcrctl`?
2. Which scenarios are maybe possible later, but not worth the effort now?
3. Which scenarios are simply not a fit?
4. Can command translation be kept small and isolated?
5. Does the comparison value justify adding `ghcrctl` as a third executor for the supported subset?

## Desired outcome

Produce a concrete support matrix with categories such as:

- supported cleanly now
- maybe later
- not a fit

And if the fit is good enough, propose the smallest implementation shape.

Implementation is optional and should only follow if the mapping stays clean.

## Evaluation Outcome

### Decision rule

Use `ghcrctl` only where one existing graph-matrix scenario maps directly to one `ghcrctl delete graph` call.

That means:

- graph-matrix only
- no mixed cleanup matrix support
- exactly one cleanup tag target
- no regex or bulk graph targeting
- no multiple `ghcrctl` calls to match one scenario

Executor result mismatches are acceptable and expected in some cases.

The purpose of adding `ghcrctl` is not to require parity with `ghcr-cleanup-manager`. It is to run the same seeded
scenario through another tool where the mapping is direct and small, then compare outcomes.

### Concrete support matrix

Supported cleanly now:

- `graph-1image-*--delete-image-a`
- `graph-2images-*--delete-image-a`
- `graph-2images-*--delete-multiarch`
- `graph-2multiarch-*--delete-image-a`
- `graph-2multiarch-*--delete-multiarch-a`
- `graph-2multiarch2tags-*--delete-multiarch-a`

These rows each have exactly one delete-tag target and map directly to:

```text
ghcrctl delete graph <owner/package> --tag <resolved-tag> --force
```

Maybe later:

- none for the current graph-matrix set

Under the current bar, rows are either a clean one-call fit or they are out of scope.

Not a fit:

- `graph-2images-*--delete-image-a-and-multiarch`
- `graph-2multiarch-*--delete-image-a-and-multiarch-a`

These rows require more than one graph target. `ghcrctl delete graph` accepts one selector per call and does not provide
regex or bulk graph deletion.

### Smallest implementation shape

If implemented, keep the integration narrow:

- add one `ghcrctl` executor name
- add it only to supported graph scenarios
- resolve one explicit `ghcrctl` tag target per supported scenario
- add one executor branch in the reusable scenario workflow
- keep post-run scanning and assertions unchanged

Avoid:

- forcing support for the older mixed cleanup matrix
- adapter logic that maps one scenario into multiple `ghcrctl` commands
- overloading `dataaxiomInputs` with `ghcrctl` semantics
- regex or heuristic bulk mapping
