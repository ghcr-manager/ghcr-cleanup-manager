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

The JSON should become two things:

- action output from the GitHub run
- an optional downloadable run artifact

This JSON should be a stable user-facing summary shape, not just a raw internal dump.

## Visibility model

Workflow-visible output is the responsibility of the calling workflow and repository visibility.

This task should assume that workflow readers are allowed to see the package-maintenance metadata shown in summaries,
logs, and plain JSON artifacts.
