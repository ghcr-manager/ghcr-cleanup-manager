#!/usr/bin/env bash
set -euo pipefail

: "${GH_TOKEN:?GH_TOKEN is required}"
: "${GITHUB_API_VERSION:?GITHUB_API_VERSION is required}"
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
: "${GITHUB_RUN_ID:?GITHUB_RUN_ID is required}"
: "${DOWNLOAD_DIR:?DOWNLOAD_DIR is required}"
: "${SOURCE_DB_DIR:?SOURCE_DB_DIR is required}"
: "${ARTIFACT_LIST_PATH:?ARTIFACT_LIST_PATH is required}"

mkdir -p "$DOWNLOAD_DIR" "$SOURCE_DB_DIR"

gh api \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: $GITHUB_API_VERSION" \
  "repos/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID/artifacts?per_page=100" \
  --jq '.artifacts[]
    | select((.name | endswith(".sqlite")) or (.name | endswith(".sqlite.enc")))
    | [.id, .name, .archive_download_url]
    | @tsv' \
  > "$ARTIFACT_LIST_PATH"

if [[ ! -s "$ARTIFACT_LIST_PATH" ]]; then
  echo "No scenario DB artifacts found to download." >&2
  exit 1
fi

while IFS=$'\t' read -r artifact_id artifact_name artifact_url; do
  artifact_zip_path="$DOWNLOAD_DIR/${artifact_name}.zip"
  artifact_extract_dir="$DOWNLOAD_DIR/$artifact_name"
  mkdir -p "$artifact_extract_dir"

  gh api \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: $GITHUB_API_VERSION" \
    "$artifact_url" \
    > "$artifact_zip_path"

  unzip -q "$artifact_zip_path" -d "$artifact_extract_dir"
  downloaded_file="$artifact_extract_dir/$artifact_name"
  if [[ ! -f "$downloaded_file" ]]; then
    echo "Downloaded artifact '$artifact_name' did not contain expected file '$artifact_name'." >&2
    exit 1
  fi

  if [[ "$artifact_name" == *.enc ]]; then
    [[ -n "${DB_ARTIFACT_ENCRYPTION_PASSPHRASE:-}" ]] || {
      echo "Encrypted DB artifacts require DB_ARTIFACT_ENCRYPTION_PASSPHRASE for download." >&2
      exit 1
    }
    output_name="${artifact_name%.enc}"
    openssl enc -d -aes-256-cbc -pbkdf2 \
      -in "$downloaded_file" \
      -out "$SOURCE_DB_DIR/$output_name" \
      -pass env:DB_ARTIFACT_ENCRYPTION_PASSPHRASE
  else
    cp "$downloaded_file" "$SOURCE_DB_DIR/$artifact_name"
  fi
done < "$ARTIFACT_LIST_PATH"
