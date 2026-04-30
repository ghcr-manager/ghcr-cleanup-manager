# ghcr-manager

[![Release](https://img.shields.io/github/v/release/gh-workflow/ghcr-manager?style=flat-square)](https://github.com/gh-workflow/ghcr-manager/releases)
[![Immutable Releases](https://img.shields.io/badge/releases-immutable-blue?labelColor=333)](https://docs.github.com/en/code-security/supply-chain-security/understanding-your-software-supply-chain/immutable-releases)
[![GitHub Marketplace](https://img.shields.io/badge/marketplace-ghcr--manager-blue?logo=github&labelColor=333&style=flat-square)](https://github.com/marketplace/actions/ghcr-manager)
[![Tests](https://img.shields.io/github/actions/workflow/status/gh-workflow/ghcr-manager/change-validation.yml?branch=main&label=test&style=flat-square)](https://github.com/gh-workflow/ghcr-manager/actions/workflows/change-validation.yml)
[![Usage](https://img.shields.io/badge/image-GHCR-2496ED?logo=docker&logoColor=white&style=flat-square)](#usage)

Inspect, analyze, and manage GitHub Container Registry packages.

`ghcr-manager` is a public GitHub Action and companion CLI for safe GHCR cleanup and inspection, with a focus on large
packages and correct handling of multi-arch images, referrers, and attestations.

## Scope

- :white_check_mark: Full package and manifest scan per run for correctness
- :white_check_mark: Export database of Container Registry from runs for local analysis
- :construction: Safe cleanup of GHCR image artifacts in GitHub packages

## How

### :white_check_mark: Data Loading

1. Writes Container Registry metadata to a database
2. Pre-processes data for optimized lookups
3. Optional: Export of database from runs for local analysis

> :construction: Planned: Support for merging several such databases into one for local analysis

### :construction: Consistency Check

1. Run consistency check against the database
2. Optional: Export report of missing manifests from runs

### :construction: Safe cleanup of GHCR image artifacts

1. Use filter input to query database for related artifacts (images and manifests)
2. Optional `dry-run`: Export which image artifacts would be deleted
3. Delete image artifacts (without `dry-run`)

## Usage

```yaml
concurrency:
  group: ghcr-manager__${{ inputs.owner }}__${{ inputs.package }}
jobs:
  scan:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: read
      actions: write # only required when upload-db-artifact is true
    concurrency:
      group: ghcr-manager
    steps:
      - uses: actions/checkout@v6

      - name: Run ghcr-manager action
        uses: gh-workflow/ghcr-manager@0.0.6
        with:
          github-token: ${{ github.token }}
          owner: OWNER
          package: PACKAGE
          upload-db-artifact: true
```

> Copy the [Manual Run Workflow](.github/workflows/manual-run.yml) as a ready-to-run manual scan workflow.

## Inputs

<!-- markdownlint-disable MD013 -->

| Input                        | Description                                                     | Required | Default                        |
| ---------------------------- | --------------------------------------------------------------- | -------- | ------------------------------ |
| `github-token`               | GitHub token used for GitHub/GHCR API calls                     | Yes      | `${{ github.token }}`          |
| `owner`                      | GitHub owner of the container package (user or org)             | Yes      |                                |
| `package`                    | Container package name                                          | Yes      |                                |
| `upload-db-artifact`         | Whether to upload the scan database as a workflow run artifact  | No       | `false`                        |
| `db-artifact-retention-days` | Optional retention days override for uploaded database artifact | No       | `${{ github.retention_days }}` |

<!-- markdownlint-enable MD013 -->

## Outputs

| Output    | Description                                             |
| --------- | ------------------------------------------------------- |
| `db-path` | Path to the SQLite database in the GitHub action runner |

## Artifacts

<!-- markdownlint-disable MD013 -->

| Name                          | Filename                          | Description                                                          |
| ----------------------------- | --------------------------------- | -------------------------------------------------------------------- |
| `${OWNER}__${PACKAGE}.sqlite` | `${OWNER}__${PACKAGE}.sqlite.zip` | Zipped SQLite database containing GitHub Container Registry metadata |

<!-- markdownlint-enable MD013 -->
