# Multiple Packages

This document covers the cases where you want to scan or clean up more than one package and download one combined DB.

Choose the pattern that matches your workflow:

- [`Sequential Steps`](#sequential-steps): one job, several package steps, one shared DB
- [`Parallel Jobs`](#parallel-jobs): several jobs, merged DB afterward

Direct sub-action docs:

- [db-merge](../db-merge/README.md)
- [merge-run-artifacts](../merge-run-artifacts/README.md)

> Permission note:
>
> - The examples below use `dry-run`, where `packages: read` is enough.
> - If you switch them to live cleanup, change those jobs to `packages: write`.

## Sequential Steps

For one job with several package steps, let the first step create the DB and pass its `db-path` to the later steps.
Upload the DB from the final action call.

```yaml
jobs:
  cleanup:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: read
      actions: write
    steps:
      - uses: actions/checkout@v6

      - name: Cleanup package one
        id: first-package
        uses: ghcr-manager/ghcr-cleanup-manager@v1.1.8
        with:
          command: cleanup
          token: ${{ github.token }}
          owner: OWNER
          package: package-one
          dry-run: true
          delete-untagged: true

      - name: Cleanup package two
        uses: ghcr-manager/ghcr-cleanup-manager@v1.1.8
        with:
          command: cleanup
          token: ${{ github.token }}
          owner: OWNER
          package: package-two
          db-path: ${{ steps.first-package.outputs.db-path }}
          dry-run: true
          delete-untagged: true
          upload-artifacts: true
```

The key points are:

- reuse the first step's `db-path` output in the later steps
- set `upload-artifacts: true` in the final step
- let the final step upload the combined DB

## Parallel Jobs

When processing packages in separate jobs, especially in parallel, let each job upload its own DB and merge them
afterward using the helper action `ghcr-cleanup-manager/ghcr-manager/merge-run-artifacts`.

Example shape:

```yaml
jobs:
  cleanup-a:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: read
      actions: write
    steps:
      - uses: actions/checkout@v6
      - uses: ghcr-manager/ghcr-cleanup-manager@v1.1.8
        with:
          command: cleanup
          token: ${{ github.token }}
          owner: OWNER
          package: package-a
          dry-run: true
          delete-untagged: true
          upload-artifacts: true

  cleanup-b:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: read
      actions: write
    steps:
      - uses: actions/checkout@v6
      - uses: ghcr-manager/ghcr-cleanup-manager@v1.1.8
        with:
          command: cleanup
          token: ${{ github.token }}
          owner: OWNER
          package: package-b
          dry-run: true
          delete-untagged: true
          upload-artifacts: true

  merge:
    needs: [cleanup-a, cleanup-b]
    runs-on: ubuntu-latest
    permissions:
      contents: read
      actions: write
    steps:
      - uses: actions/checkout@v6

      - name: Merge current-run DB artifacts
        uses: ghcr-manager/ghcr-cleanup-manager/merge-run-artifacts@v1.1.8
        with:
          artifact-name-glob: "*.sqlite" #default
          db-file: ghcr-cleanup-manager-merged.sqlite #default
```

> Note: `merge-run-artifacts` uses the helper action `db-merge` internally.
