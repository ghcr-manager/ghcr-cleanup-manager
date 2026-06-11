# CLI Usage

This document covers the GHCR Cleanup Manager companion CLI.

Install from `npm` and run `ghcr-manager` directly.

```sh
npm install --global ghcr-manager
```

> Requirement: Node.js `24` or newer.

## Commands

```sh
ghcr-manager <command> ...
```

## Scan

```sh
ghcr-manager scan \
  --db ./tmp/example.sqlite \
  --owner OWNER \
  --package PACKAGE \
  --token "$GITHUB_TOKEN"
```

Note: local scanning is much slower than scanning in a GitHub runner.

## Cleanup

Dry-run example:

```sh
ghcr-manager cleanup \
  --db ./tmp/example.sqlite \
  --owner OWNER \
  --package PACKAGE \
  --dry-run \
  --delete-untagged
```

Tagged cleanup example:

```sh
ghcr-manager cleanup \
  --db ./tmp/example.sqlite \
  --owner OWNER \
  --package PACKAGE \
  --token "$GITHUB_TOKEN" \
  --delete-tag 'pr-.*' \
  --use-regex \
  --older-than '30 days' \
  --exclude-tag latest
```

Combined tagged and untagged cleanup example:

```sh
ghcr-manager cleanup \
  --db ./tmp/example.sqlite \
  --owner OWNER \
  --package PACKAGE \
  --dry-run \
  --delete-tag '.*' \
  --exclude-tag '^keep-me$' \
  --use-regex \
  --older-than '30 days' \
  --delete-untagged
```

Notes:

- `cleanup` requires `--db` because it writes and reads its scan snapshot through the SQLite DB
- omit `--token` only when using `--dry-run`
- `dry-run` prints stable summary JSON to stdout
- cleanup summary JSON includes derived `affectedManifests` for fully deletable roots
- cleanup is graph-aware; retained tags protect reachable manifests, and no-longer-reachable graph sections may be
  deleted together with a direct target
- `--older-than` takes one integer plus one unit
  - supported `--older-than` units: `minutes`, `hours`, `days`, `weeks`, `months`, `years`
  - example values: `30 days`, `2 hours`, `1 month`
- tagged selector families may be combined with `--delete-untagged`
- `--exclude-tag` requires at least one tagged selector family
- `--delete-untagged` and `--keep-n-untagged` cannot be combined

For the full model, see [Cleanup Behavior](cleanup-behavior.md).

## DB Merge

```sh
ghcr-manager db-merge \
  --db ./tmp/merged.sqlite \
  --source-db ./tmp/run-a.sqlite \
  --source-db ./tmp/run-b.sqlite
```

Use `db-merge` when you already have several local SQLite files and want one merged analysis DB.
