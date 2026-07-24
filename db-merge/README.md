# GHCR Cleanup Manager DB Merge Action

Merge one or more local GHCR Cleanup Manager SQLite databases into a single target database.

Use this helper action when you already have several `.sqlite` files on the runner and want one merged analysis DB.

## Inputs

<!-- markdownlint-disable MD013 -->

| Input                        | Required | Description                                       | Default                        |
| ---------------------------- | -------- | ------------------------------------------------- | ------------------------------ |
| `source-db-dir`              | yes      | Local directory containing SQLite DB files        |                                |
| `db-file`                    | yes      | Local filename and artifact name for merged DB    |                                |
| `upload-artifacts`           | no       | Whether to upload the merged DB artifact          | `true`                         |
| `db-artifact-retention-days` | no       | Optional retention days override for the artifact | `${{ github.retention_days }}` |
| `log-level`                  | no       | Log level passed to the shared CLI                | `info`                         |

<!-- markdownlint-enable MD013 -->

## Outputs

| Output            | Description                                     |
| ----------------- | ----------------------------------------------- |
| `db-path`         | Path to the merged SQLite DB on the runner      |
| `artifact-id`     | Uploaded artifact ID when upload is enabled     |
| `artifact-url`    | Uploaded artifact URL when upload is enabled    |
| `artifact-digest` | Uploaded artifact digest when upload is enabled |

## Example

```yaml
- name: Merge local scan DBs
  uses: ghcr-manager/ghcr-cleanup-manager/db-merge@v1.1.8
  with:
    source-db-dir: ./artifacts/sqlite
    db-file: ghcr-cleanup-manager-merged.sqlite
```

## Notes

- This action scans `source-db-dir` recursively for `*.sqlite` files and merges all matches.
- The merged DB is created in runner temp space and exposed through `db-path`.
- If you want to merge artifacts from the current workflow run directly, use
  [`merge-run-artifacts`](../merge-run-artifacts/README.md) instead.
- For broader multi-package workflow patterns, see [docs/db-merge-workflows.md](../docs/db-merge-workflows.md).
