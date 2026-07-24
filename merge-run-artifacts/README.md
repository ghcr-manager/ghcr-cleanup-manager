# GHCR Cleanup Manager Merge Run Artifacts Action

Download matching current-run SQLite artifacts, merge them into one database, upload the merged DB, and optionally
delete the source artifacts.

Use this helper action when several jobs in the same workflow run each uploaded their own GHCR Cleanup Manager scan or
cleanup database, and you want one merged artifact at the end.

## Inputs

<!-- markdownlint-disable MD013 -->

| Input                        | Required | Description                                              | Default                              |
| ---------------------------- | -------- | -------------------------------------------------------- | ------------------------------------ |
| `artifact-name-glob`         | no       | Glob used to select current-run artifacts                | `"*.sqlite"`                         |
| `db-file`                    | no       | Local filename and artifact name for the merged DB       | `ghcr-cleanup-manager-merged.sqlite` |
| `upload-artifacts`           | no       | Whether to upload the merged DB artifact                 | `true`                               |
| `db-artifact-retention-days` | no       | Optional retention days override for the merged artifact | `${{ github.retention_days }}`       |
| `delete-source-artifacts`    | no       | Whether to delete matching source artifacts after merge  | `true`                               |
| `log-level`                  | no       | Log level passed through to the nested merge flow        | `info`                               |

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
- name: Merge current-run DB artifacts
  uses: ghcr-manager/ghcr-cleanup-manager/merge-run-artifacts@v1.1.8
  with:
    artifact-name-glob: "*.sqlite"
    db-file: ghcr-cleanup-manager-merged.sqlite
```

## Notes

- This action only works with artifacts from the current workflow run.
- It uses [`db-merge`](../db-merge/README.md) internally after downloading matching artifacts.
- By default, it deletes the matched source artifacts after a successful merge. Set `delete-source-artifacts: false` if
  you want to keep them.
- For broader multi-package workflow patterns, see [docs/db-merge-workflows.md](../docs/db-merge-workflows.md).
