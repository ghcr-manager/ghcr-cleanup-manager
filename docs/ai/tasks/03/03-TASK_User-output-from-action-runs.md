# 03 Task: User output from action runs

Our ongoing work on `docs/ai/tasks/04/README.md` shows a gap.

This action lacks useful user-facing output directly in GitHub runs. Users currently have to download the DB or read
JSON in the logs.

This leads to having to instruct first-time users to download the DB and look at it just for their first dry-run.

Looking at the DB is advanced. Looking at a foreign DB is work. Plus DB know-how is not necessarily present for GHCR
admins nor will they want to take the time.

## Primary target

The first target should be `cleanup`, especially `dry-run`.

That is the first-run trust-building case where users need to see clearly what matched and what would happen.

## Solution proposal: simple output in GitHub runs plus JSON as run artifact

The action or the node code already produce JSON output, quite similar to `../../dataaxiom/ghcr-cleanup-action`, at
least the data that action shows in tabular form is in our JSON.

But the user-facing output should not just dump internal JSON. It should be a stable summary intended for humans first
and machines second.

The main human-readable output should go to the GitHub step summary. Concise log output may also be useful, but the step
summary should be the primary review surface.

There should be some sane cutoff for tabular output. We do not want to print 50k rows of tags. The output should
therefore use truncation and counts when result sets get large.

## What users should see

For `cleanup` dry-run, the first user-facing summary should make it easy to verify:

- which package was processed
- whether this was `dry-run` or live cleanup
- which tags matched directly
- which roots would be fully deletable
- which roots would only be untagged
- which roots were blocked
- whether a DB artifact was uploaded

Tag-level visibility is intentional here. Users need to see tags in order to trust their first run.

## JSON output

The current JSON log output can stay for now.

This task should additionally make that same summary JSON available as:

- a machine-readable action output from the GitHub run
- an optional downloadable run artifact alongside the DB artifact

The same boolean upload setting should govern both DB and JSON artifact upload. If that setting needs a better name,
rename it rather than adding a second toggle.

This JSON should be a stable user-facing summary shape, not just a raw internal dump.

The human-readable GitHub step summary should be rendered from that same summary data, so the action does not grow a
separate parallel reporting model.

Keep action and workflow YAML small. If capturing, reshaping, or rendering the summary becomes non-trivial, move that
logic into small repo-local helper scripts instead of expanding inline shell logic.

## Visibility model

Workflow-visible output is the responsibility of the calling workflow and repository visibility.

This task should assume that workflow readers are allowed to see the package-maintenance metadata shown in summaries,
logs, and plain JSON artifacts.

## Completion

Completed on the current release-prep branch for the intended first target.

- `cleanup` now emits one stable summary JSON shape for both dry-run and live cleanup.
- The root action exposes machine-readable `summary-json` output for commands that emit summary JSON.
- `cleanup` uploads its summary JSON alongside the DB when DB artifact upload is enabled.
- `cleanup` renders a GitHub step summary from that same summary JSON.
- `untag` also feeds the generic `summary-json` action output.

Intentional scope choice:

- `scan` keeps its existing JSON stdout and scalar GitHub outputs.
- `scan` was not added to the generic `summary-json` action output path, because that added little value for now while
  slightly increasing action complexity.

Checkpoint commits:

- `3d20a13` Add cleanup run summaries to action output
- `a5377c3` Unify action command summary output
- `51f305a` Silence npm wrapper for action summary capture
- `8cb45c0` Tighten cleanup step summary layout
