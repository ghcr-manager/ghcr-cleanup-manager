# ghcr-manager

[![Release](https://img.shields.io/github/v/release/gh-workflow/ghcr-manager?style=flat-square)](https://github.com/gh-workflow/ghcr-manager/releases)
[![Immutable Releases](https://img.shields.io/badge/releases-immutable-blue?labelColor=333)](https://docs.github.com/en/code-security/supply-chain-security/understanding-your-software-supply-chain/immutable-releases)
[![GitHub Marketplace](https://img.shields.io/badge/marketplace-ghcr--manager-blue?logo=github&labelColor=333&style=flat-square)](https://github.com/marketplace/actions/ghcr-manager)
[![Tests](https://img.shields.io/github/actions/workflow/status/gh-workflow/ghcr-manager/.github/workflows/ci_change-validation.yml?branch=main&label=test&style=flat-square)](https://github.com/gh-workflow/ghcr-manager/actions/workflows/change-validation.yml)

Inspect, review, and manage GitHub Container Registry packages.

`ghcr-manager` is a GitHub Action for:

- scanning one GHCR package into a SQLite database artifact
- running cleanup with a GitHub step summary and optional DB artifact
- previewing cleanup decisions with `dry-run` before making changes
- directly removing selected tags with `untag`

## Quick Start

For a first run, start with `cleanup` in `dry-run` mode.

```yaml
jobs:
  cleanup:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: read
      actions: write
    concurrency:
      group: ghcr-manager__OWNER__PACKAGE
    steps:
      - uses: actions/checkout@v6

      - name: Preview GHCR cleanup
        id: ghcr-manager
        uses: gh-workflow/ghcr-manager@0.9.2
        with:
          command: cleanup
          token: ${{ github.token }}
          owner: OWNER
          package: PACKAGE
          dry-run: true
          delete-untagged: true
          keep-n-tagged: "10"
          exclude-tags: |
            latest
          upload-db-artifact: true
```

After the run:

1. Open the GitHub step summary for the action run.
2. Review which tags matched and which roots would be deleted, untagged, or blocked.
3. Only download the DB artifact if you need deeper inspection.

## Commands

The action supports three commands:

- `cleanup`: Cleans using filters; use `dry-run` to preview the result
- `untag`: Removes one or more tags directly
- `scan`: Scans one package and uploads the resulting DB artifact

### Purpose of commands

- `cleanup`: Normal entry point for registry maintenance
- `untag`: Works directly without a full package scan
- `scan`: For investigation and audit

## Common Usage

### Preview cleanup

```yaml
- uses: gh-workflow/ghcr-manager@0.9.2
  with:
    command: cleanup
    token: ${{ github.token }}
    owner: OWNER
    package: PACKAGE
    dry-run: true
    delete-tags: |
      pr-.*
    use-regex: true
    older-than: 30d
    keep-n-tagged: "5"
    exclude-tags: |
      latest
      stable
    upload-db-artifact: true
```

### Apply cleanup

```yaml
- uses: gh-workflow/ghcr-manager@0.9.2
  with:
    command: cleanup
    token: ${{ github.token }}
    owner: OWNER
    package: PACKAGE
    delete-untagged: true
    keep-n-tagged: "10"
    upload-db-artifact: true
    scan-after-cleanup: true
```

If `scan-after-cleanup` is `true`, `cleanup` performs a second scan so the uploaded DB reflects post-mutation state.

Note: the second scan only runs if cleanup actually makes changes.

### Remove selected tags directly

```yaml
- uses: gh-workflow/ghcr-manager@0.9.2
  with:
    command: untag
    token: ${{ github.token }}
    owner: OWNER
    package: PACKAGE
    delete-tags: |
      old-tag
      test-tag
```

`untag` does not use a scan DB and does not support DB artifact upload.

### Scan one package

```yaml
- uses: gh-workflow/ghcr-manager@0.9.2
  with:
    command: scan
    token: ${{ github.token }}
    owner: OWNER
    package: PACKAGE
```

`scan` always uploads a DB artifact.

## Inputs

<!-- markdownlint-disable MD013 MD060 -->

| Input                        | Description                         | Cmds | Required    | Default                        |
| ---------------------------- | ----------------------------------- | ---- | ----------- | ------------------------------ |
| `command`                    | `scan`, `cleanup`, or `untag`       | all  | Yes         |                                |
| `token`                      | GitHub token for API calls          | all  | Yes         | `${{ github.token }}`          |
| `owner`                      | Package owner                       | all  | Yes         |                                |
| `package`                    | Package name                        | all  | Yes         |                                |
| `db-path`                    | Local SQLite DB path                | s,c  | No          |                                |
| `upload-db-artifact`         | Upload DB and summary artifact      | s,c  | No          | `false`                        |
| `scan-after-cleanup`         | Run a second scan after cleanup     | c    | No          | `false`                        |
| `db-artifact-retention-days` | Override artifact retention days    | s,c  | No          | `${{ github.retention_days }}` |
| `delete-tags`                | Newline-separated tags to delete    | c,u  | for `untag` |                                |
| `exclude-tags`               | Newline-separated tags to exclude   | c    | No          |                                |
| `keep-n-tagged`              | Keep newest tagged roots            | c    | No          |                                |
| `keep-n-untagged`            | Keep newest untagged roots          | c    | No          |                                |
| `delete-untagged`            | Delete untagged roots               | c    | No          | `false`                        |
| `delete-ghost-images`        | Delete ghost multi-arch roots       | c    | No          | `false`                        |
| `delete-partial-images`      | Delete partial multi-arch roots     | c    | No          | `false`                        |
| `delete-orphaned-images`     | Delete orphaned digest-derived tags | c    | No          | `false`                        |
| `older-than`                 | Age cutoff for cleanup selectors    | c    | No          |                                |
| `use-regex`                  | Use regex for cleanup tag selectors | c    | No          | `false`                        |
| `dry-run`                    | Show changes without mutating GHCR  | c,u  | No          | `false`                        |
| `log-level`                  | CLI log level                       | all  | No          | `info`                         |

<!-- markdownlint-enable MD013 MD060 -->

`Cmds`: `s` = `scan`, `c` = `cleanup`, `u` = `untag`

Cleanup notes:

- Tagged selector families may be combined with `delete-untagged`.
- `exclude-tags` requires at least one tagged selector family.
- `delete-untagged` and `keep-n-untagged` cannot be combined.

## Outputs

| Output         | Description                            |
| -------------- | -------------------------------------- |
| `db-path`      | SQLite DB path on the runner           |
| `summary-json` | Summary JSON for `cleanup` and `untag` |

## Artifacts

When artifacts are enabled:

- `scan` always uploads one SQLite DB artifact
- `cleanup` optionally uploads the DB artifact and a cleanup summary JSON artifact
- `untag` uploads no artifacts

Current naming:

| Artifact type        | Filename pattern                                    |
| -------------------- | --------------------------------------------------- |
| scan or cleanup DB   | `${OWNER}__${PACKAGE}.sqlite`                       |
| cleanup summary JSON | `${OWNER}__${PACKAGE}.sqlite--cleanup-summary.json` |

## Documentation Map

- [docs/action-usage.md](docs/action-usage.md): action commands, including `cleanup`, `scan`, and `untag`
- [docs/db-merge-workflows.md](docs/db-merge-workflows.md): cleaning up multiple packages with one combined DB
- [docs/schema-description.md](docs/schema-description.md): practical explanation of the SQLite schema
- [docs/queries/missing-manifests-queries.md](docs/queries/missing-manifests-queries.md): SQL recipes for missing
  manifest references
- [docs/cli-usage.md](docs/cli-usage.md): companion CLI usage

## Acknowledgment

This project was influenced by [dataaxiom/ghcr-cleanup-action](https://github.com/dataaxiom/ghcr-cleanup-action), with a
similar problem focus and a different implementation approach.
