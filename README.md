# GHCR Cleanup Manager

[![GitHub Marketplace](https://img.shields.io/badge/marketplace-ghcr--cleanup--manager-blue?logo=github&labelColor=333&style=flat-square)](https://github.com/marketplace/actions/ghcr-manager)
[![Release](https://img.shields.io/github/v/release/ghcr-manager/ghcr-cleanup-manager?style=flat-square)](https://github.com/ghcr-manager/ghcr-cleanup-manager/releases)
[![Immutable Releases](https://img.shields.io/badge/releases-immutable-blue?labelColor=333)](https://docs.github.com/en/code-security/supply-chain-security/understanding-your-software-supply-chain/immutable-releases)
[![Tests](https://img.shields.io/github/actions/workflow/status/ghcr-manager/ghcr-cleanup-manager/.github/workflows/ci_change-validation.yml?branch=main&label=test&style=flat-square)](https://github.com/ghcr-manager/ghcr-cleanup-manager/actions/workflows/ci_change-validation.yml)

GHCR Cleanup Manager is a GHCR cleanup action for GitHub Container Registry packages.

GHCR Cleanup Manager is a GitHub Action for:

- clean GHCR packages including tagged and untagged images
- preview cleanup with `dry-run` before making changes
- scan GHCR packages into SQLite database artifacts
- visualize GHCR package graphs and their changes with the
  [visualizer](https://github.com/ghcr-manager/ghcr-cleanup-manager/blob/main/visualizer/README.md)

It is built for safe GHCR cleanup on OCI package graphs, including multi-arch images, attestations, cosign signatures,
and other referrers that simpler GHCR cleanup actions often mishandle.

[![Example compare view: red-bordered manifests are present in the older scan and removed in the newer one.](https://raw.githubusercontent.com/ghcr-manager/ghcr-cleanup-manager/main/docs/images/visualizer/graph-2images-cosign--wide.png "Example compare view: red-bordered manifests are present in the older scan and removed in the newer one.")](https://github.com/ghcr-manager/ghcr-cleanup-manager/blob/main/docs/images/visualizer/graph-2images-cosign--wide.png)

_Example graph compare view: red-bordered manifests are present in the older scan and removed in the newer one._

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
      group: ghcr-cleanup-manager__OWNER__PACKAGE
    steps:
      - uses: actions/checkout@v6

      - name: Preview GHCR cleanup
        id: ghcr-cleanup-manager
        uses: ghcr-manager/ghcr-cleanup-manager@v1.1.3
        with:
          command: cleanup
          token: ${{ github.token }}
          owner: OWNER
          package: PACKAGE
          dry-run: true
          delete-untagged: true
          keep-n-tagged: 10
          exclude-tags: |
            latest
          upload-artifacts: true
```

> Permission notes:
>
> - `scan` and `cleanup` dry-runs need `packages: read`
> - live `cleanup` that mutates GHCR needs `packages: write`
> - artifact upload needs `actions: write`

After the run:

1. Open the GitHub step summary for the action run.
2. Review which tags matched and which roots would be deleted, untagged, or blocked.
3. Only download the DB artifact if you need deeper inspection.

## Commands

The action supports two commands:

- `cleanup`: Cleans using filters; use `dry-run` to preview the result
- `scan`: Scans one package and uploads the resulting DB artifact

### Purpose of commands

- `cleanup`: Normal entry point for registry maintenance
- `scan`: For investigation and audit

## Common Usage

### Preview cleanup

```yaml
- uses: ghcr-manager/ghcr-cleanup-manager@v1.1.3
  with:
    command: cleanup
    token: ${{ github.token }}
    owner: OWNER
    package: PACKAGE
    dry-run: true
    delete-tags: |
      pr-.*
    use-regex: true
    older-than: 30 days
    keep-n-tagged: 5
    exclude-tags: |
      latest
      stable
    upload-artifacts: true
```

### Apply cleanup

```yaml
- uses: ghcr-manager/ghcr-cleanup-manager@v1.1.3
  with:
    command: cleanup
    token: ${{ github.token }}
    owner: OWNER
    package: PACKAGE
    delete-untagged: true
    keep-n-tagged: 10
    upload-artifacts: true
    scan-after-cleanup: true
```

If `scan-after-cleanup` is `true`, `cleanup` performs a second scan so the uploaded DB reflects post-mutation state.

Note: the second scan only runs if cleanup actually makes changes.

Live cleanup permission note: change the workflow permission from `packages: read` to `packages: write` before turning
off `dry-run`.

### Scan one package

```yaml
- uses: ghcr-manager/ghcr-cleanup-manager@v1.1.3
  with:
    command: scan
    token: ${{ github.token }}
    owner: OWNER
    package: PACKAGE
```

`scan` always uploads a DB artifact.

## Inputs

<!-- markdownlint-disable MD013 MD060 -->

| Input                        | Description                         | Cmds | Required | Default                        |
| ---------------------------- | ----------------------------------- | ---- | -------- | ------------------------------ |
| `command`                    | `scan` or `cleanup`                 | all  | Yes      |                                |
| `token`                      | GitHub token for API calls          | all  | Yes      | `${{ github.token }}`          |
| `owner`                      | Package owner                       | all  | Yes      |                                |
| `package`                    | Package name                        | all  | Yes      |                                |
| `db-path`                    | Local SQLite DB path                | s,c  | No       |                                |
| `upload-artifacts`           | Upload DB and summary artifacts     | s,c  | No       | `false`                        |
| `scan-after-cleanup`         | Run a second scan after cleanup     | c    | No       | `false`                        |
| `db-artifact-retention-days` | Override artifact retention days    | s,c  | No       | `${{ github.retention_days }}` |
| `delete-tags`                | Newline-separated tags to delete    | c    | No       |                                |
| `exclude-tags`               | Newline-separated tags to exclude   | c    | No       |                                |
| `keep-n-tagged`              | Keep newest tagged roots            | c    | No       |                                |
| `keep-n-untagged`            | Keep newest untagged roots          | c    | No       |                                |
| `delete-untagged`            | Delete untagged roots               | c    | No       | `false`                        |
| `delete-ghost-images`        | Delete ghost multi-arch roots       | c    | No       | `false`                        |
| `delete-partial-images`      | Delete partial multi-arch roots     | c    | No       | `false`                        |
| `delete-orphaned-images`     | Delete orphaned digest-derived tags | c    | No       | `false`                        |
| `older-than`                 | Age cutoff for cleanup selectors    | c    | No       |                                |
| `use-regex`                  | Use regex for cleanup tag selectors | c    | No       | `false`                        |
| `dry-run`                    | Show changes without mutating GHCR  | c    | No       | `false`                        |
| `log-level`                  | CLI log level                       | all  | No       | `info`                         |

<!-- markdownlint-enable MD013 MD060 -->

`Cmds`: `s` = `scan`, `c` = `cleanup`

Cleanup command notes:

- Tagged selector families may be combined with `delete-untagged`.
- `exclude-tags` requires at least one tagged selector family.
- `delete-untagged` and `keep-n-untagged` cannot be combined.
- `older-than` takes one integer plus one unit.
  - Supported `older-than` units: `minutes`, `hours`, `days`, `weeks`, `months`, `years`.
  - Example values: `30 days`, `2 hours`, `1 month`.

## Outputs

| Output              | Description                          |
| ------------------- | ------------------------------------ |
| `db-path`           | SQLite DB path on the runner         |
| `summary-json-path` | Summary JSON file path for `cleanup` |

## Artifacts

When artifacts are enabled:

- `scan` always uploads one SQLite DB artifact
- `cleanup` optionally uploads the DB artifact and a cleanup summary JSON artifact

Current naming:

| Artifact type        | Filename pattern                                    |
| -------------------- | --------------------------------------------------- |
| scan or cleanup DB   | `${OWNER}__${PACKAGE}.sqlite`                       |
| cleanup summary JSON | `${OWNER}__${PACKAGE}.sqlite--cleanup-summary.json` |

## Documentation Map

- [GitHub Action usage](https://github.com/ghcr-manager/ghcr-cleanup-manager/blob/main/docs/action-usage.md): action
  commands, including `cleanup` and `scan`
- [Cleanup behavior](https://github.com/ghcr-manager/ghcr-cleanup-manager/blob/main/docs/cleanup-behavior.md): how
  cleanup protects retained tags and handles shared graphs
- [ghcr-cleanup-manager-visualizer](https://github.com/ghcr-manager/ghcr-cleanup-manager/blob/main/visualizer/README.md):
  local graph inspection and scan-to-scan comparison
- [Multi-package workflows](https://github.com/ghcr-manager/ghcr-cleanup-manager/blob/main/docs/db-merge-workflows.md):
  cleaning up multiple packages with one combined DB
- [SQLite schema guide](https://github.com/ghcr-manager/ghcr-cleanup-manager/blob/main/docs/schema-description.md):
  practical explanation of the SQLite schema
- [CLI usage](https://github.com/ghcr-manager/ghcr-cleanup-manager/blob/main/docs/cli-usage.md): companion CLI usage

## Explore A Real Scenario DB

The release assets also include one merged SQLite DB from GHCR Cleanup Manager's live scenario workflows. You can use it
as a quick visualizer demo and as a compact way to inspect dozens of real cleanup and graph cases.

```sh
curl -LO https://github.com/ghcr-manager/ghcr-cleanup-manager/releases/latest/download/ghcr-cleanup-manager-release-scenarios.sqlite
npx ghcr-cleanup-manager-visualizer --db ./ghcr-cleanup-manager-release-scenarios.sqlite
```

Docker image available:
[visualizer Docker usage](https://github.com/ghcr-manager/ghcr-cleanup-manager/blob/main/visualizer/README.md#docker).

For a first look in the visualizer, start with:

- owner: `ghcr-cleanup-manager-test`
- package: select one with `2images` or `2multiarch` in the name
- tag search: `image` or `multiarch`

For more details, see [visualizer](https://github.com/ghcr-manager/ghcr-cleanup-manager/blob/main/visualizer/README.md)
and [test-scenarios](https://github.com/ghcr-manager/ghcr-cleanup-manager/blob/main/docs/test/scenarios.md).

## Cleanup Behavior

Cleanup is tag-based for both selection and protection. Use tags to say what should be cleaned up, and use retained tags
to keep image and multi-arch graphs protected.

Manifests reachable from retained tags stay protected. Manifests no longer reachable from any retained tag may be
removed during cleanup. If you pull images by digest, make sure those digests are still reachable through tags that your
cleanup rules keep.

For the full explanation and graph examples, see
[cleanup-behavior](https://github.com/ghcr-manager/ghcr-cleanup-manager/blob/main/docs/cleanup-behavior.md).

## Project

Main project and issue tracker:

- Repository: <https://github.com/ghcr-manager/ghcr-cleanup-manager>
- Issues: <https://github.com/ghcr-manager/ghcr-cleanup-manager/issues>

## Similar Tools

- [ghcr-manager/ghcr-untag-action](https://github.com/ghcr-manager/ghcr-untag-action): focused tag removal without the
  broader scan and cleanup workflow.
- [dataaxiom/ghcr-cleanup-action](https://github.com/dataaxiom/ghcr-cleanup-action): another GHCR cleanup action with a
  similar problem focus.
- [mkoepf/ghcrctl](https://github.com/mkoepf/ghcrctl): CLI tooling for working with GHCR packages and graph deletions.
