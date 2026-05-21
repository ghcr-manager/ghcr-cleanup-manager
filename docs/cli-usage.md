# CLI Usage

This document covers the companion CLI.

Install from `npm` and run `ghcr-manager` directly.

```bash
npm install --global ghcr-manager
```

## Commands

```bash
ghcr-manager <command> ...
```

## Scan

```bash
ghcr-manager scan \
  --db ./tmp/example.sqlite \
  --owner OWNER \
  --package PACKAGE \
  --token "$GITHUB_TOKEN"
```

Note: local scanning is much slower than scanning in a GitHub runner.

## Cleanup

Dry-run example:

```bash
ghcr-manager cleanup \
  --db ./tmp/example.sqlite \
  --owner OWNER \
  --package PACKAGE \
  --dry-run \
  --delete-untagged
```

Tagged cleanup example:

```bash
ghcr-manager cleanup \
  --db ./tmp/example.sqlite \
  --owner OWNER \
  --package PACKAGE \
  --token "$GITHUB_TOKEN" \
  --delete-tag 'pr-.*' \
  --use-regex \
  --older-than 30d \
  --exclude-tag latest
```

Combined tagged and untagged cleanup example:

```bash
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
- tagged selector families may be combined with `--delete-untagged`
- `--exclude-tag` requires at least one tagged selector family
- `--delete-untagged` and `--keep-n-untagged` cannot be combined

## Untag

```bash
ghcr-manager untag \
  --owner OWNER \
  --package PACKAGE \
  --token "$GITHUB_TOKEN" \
  --tag old-tag \
  --tag test-tag
```

Unlike `cleanup`, `untag` does not take `--db`.

## DB Merge

```bash
ghcr-manager db-merge \
  --db ./tmp/merged.sqlite \
  --source-db ./tmp/run-a.sqlite \
  --source-db ./tmp/run-b.sqlite
```

Use `db-merge` when you already have several local SQLite files and want one merged analysis DB.
