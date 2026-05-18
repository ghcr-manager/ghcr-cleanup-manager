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

The action supports two commands:

- `scan`: scan one package and always upload the resulting DB artifact
- `cleanup`: scan first, then simulate or apply cleanup selectors; DB upload stays optional here, and a second
  post-cleanup scan is opt-in

```yaml
concurrency:
  group: ghcr-manager__${{ inputs.owner }}__${{ inputs.package }}
jobs:
  cleanup:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
      actions: write # only required when upload-db-artifact is true
    concurrency:
      group: ghcr-manager
    steps:
      - uses: actions/checkout@v6

      - name: Run ghcr-manager action
        uses: gh-workflow/ghcr-manager@0.0.6
        with:
          command: cleanup
          github-token: ${{ github.token }}
          owner: OWNER
          package: PACKAGE
          delete-untagged: true
          dry-run: true
          upload-db-artifact: true
          scan-after-cleanup: true
          db-artifact-encryption-passphrase: ${{ secrets.DB_ARTIFACT_ENCRYPTION_PASSPHRASE }}
```

> Copy the [Manual Run Workflow](.github/workflows/manual-run_scan.yml) as a ready-to-run workflow and switch `command`
> between `scan` and `cleanup` as needed.

## Inputs

<!-- markdownlint-disable MD013 MD060 -->

| Input                               | Description                                                                                                      | Required | Default                        |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------ |
| `command`                           | Action command: `scan` or `cleanup`                                                                              | Yes      |                                |
| `github-token`                      | GitHub token used for GitHub/GHCR API calls                                                                      | Yes      | `${{ github.token }}`          |
| `owner`                             | GitHub owner of the container package (user or org)                                                              | Yes      |                                |
| `package`                           | Container package name                                                                                           | Yes      |                                |
| `db-path`                           | Optional local SQLite DB path so multiple action steps can append to the same DB                                 | No       |                                |
| `upload-db-artifact`                | Whether `cleanup` should upload the resulting DB artifact. `scan` always uploads regardless of this setting      | No       | `false`                        |
| `scan-after-cleanup`                | Whether live `cleanup` should run a second full scan so the DB reflects post-mutation state                      | No       | `false`                        |
| `db-artifact-encryption-passphrase` | Optional passphrase for encrypting uploaded DB artifacts; required for non-public registries when upload happens | No       |                                |
| `db-artifact-retention-days`        | Optional retention days override for uploaded database artifact                                                  | No       | `${{ github.retention_days }}` |
| `delete-tags`                       | Optional comma-separated tags to delete during `cleanup`                                                         | No       |                                |
| `exclude-tags`                      | Optional comma-separated tags to exclude during `cleanup`                                                        | No       |                                |
| `keep-n-tagged`                     | Optional number of tagged roots to keep during `cleanup`                                                         | No       |                                |
| `keep-n-untagged`                   | Optional number of untagged roots to keep during `cleanup`                                                       | No       |                                |
| `delete-untagged`                   | Whether `cleanup` should target untagged roots                                                                   | No       | `false`                        |
| `delete-ghost-images`               | Whether `cleanup` should target ghost multi-arch roots                                                           | No       | `false`                        |
| `delete-partial-images`             | Whether `cleanup` should target partial multi-arch roots                                                         | No       | `false`                        |
| `delete-orphaned-images`            | Whether `cleanup` should target orphaned digest-derived tags                                                     | No       | `false`                        |
| `older-than`                        | Optional age cutoff for `cleanup` selectors                                                                      | No       |                                |
| `use-regex`                         | Whether `cleanup` tag selectors should be treated as regular expressions                                         | No       | `false`                        |
| `dry-run`                           | Whether `cleanup` should simulate the plan without mutating GHCR                                                 | No       | `false`                        |
| `log-level`                         | Log level passed to the shared CLI                                                                               | No       | `info`                         |

<!-- markdownlint-enable MD013 MD060 -->

## Outputs

| Output    | Description                                             |
| --------- | ------------------------------------------------------- |
| `db-path` | Path to the SQLite database in the GitHub action runner |

## Artifacts

<!-- markdownlint-disable MD013 -->

| Name                              | Filename                          | Description                                          |
| --------------------------------- | --------------------------------- | ---------------------------------------------------- |
| `${OWNER}__${PACKAGE}.sqlite`     | `${OWNER}__${PACKAGE}.sqlite`     | Plain SQLite database artifact for public registries |
| `${OWNER}__${PACKAGE}.sqlite.enc` | `${OWNER}__${PACKAGE}.sqlite.enc` | OpenSSL-encrypted SQLite database artifact           |

<!-- markdownlint-enable MD013 -->

## Encrypted Artifacts

If `db-artifact-encryption-passphrase` is set, `ghcr-manager` encrypts the uploaded DB artifact with OpenSSL before
upload. For non-public registries, this passphrase is required whenever the action uploads a DB artifact.

Encrypted artifacts use OpenSSL `enc` with:

- `-aes-256-cbc`
- `-pbkdf2`
- `-salt`

To decrypt an uploaded `*.sqlite.enc` artifact:

```bash
openssl enc -d -aes-256-cbc -pbkdf2 \
  -in OWNER__PACKAGE.sqlite.enc \
  -out OWNER__PACKAGE.sqlite
```

Or with the passphrase already in an environment variable:

```bash
openssl enc -d -aes-256-cbc -pbkdf2 \
  -in OWNER__PACKAGE.sqlite.enc \
  -out OWNER__PACKAGE.sqlite \
  -pass env:DB_ARTIFACT_ENCRYPTION_PASSPHRASE
```
