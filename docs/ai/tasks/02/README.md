# 02 Task: Remove built-in DB artifact encryption

Before first release, remove built-in encryption and decryption support for DB artifacts.

## Decision

This project should no longer treat DB artifacts as a special protected output class.

Running this action assumes that workflow readers are allowed to see package-maintenance metadata for the targeted
package.

That same trust model should apply consistently to:

- action logs
- GitHub step summary output
- JSON review output from runs
- DB artifacts

## Why

Built-in DB artifact encryption has become a poor fit for the actual product.

- First-time users already need understandable dry-run output directly in GitHub runs.
- That output will necessarily expose tag-level cleanup information.
- The DB mostly aggregates information that sufficiently authorized package readers can already obtain through GitHub
  Packages and registry reads.
- The current encryption flow adds friction for users and substantial complexity to artifact upload, download, merge,
  testing, and documentation.

This is not a good trade-off for first release.

## Scope

Remove built-in encryption and decryption support across the product:

- root action inputs and behavior
- DB artifact upload behavior
- artifact merge flows
- helper scripts
- tests
- user-facing documentation

## Non-goals

- Do not replace this with another protection or secret-management mechanism now.
- Do not introduce alternative encryption options or compatibility layers.

## Follow-up effect on other tasks

- Task 03 can assume readable user-facing output and readable JSON run artifacts.
- Task 02 can drop encryption guidance from first-release docs.
