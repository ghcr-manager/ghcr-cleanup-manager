#!/usr/bin/env bash
set -euo pipefail

readonly _GITHUB_API_VERSION="2022-11-28"

: "${GH_TOKEN:?GH_TOKEN is required}"
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
: "${GITHUB_RUN_ID:?GITHUB_RUN_ID is required}"
: "${RUNNER_TEMP:?RUNNER_TEMP is required}"
: "${ARTIFACT_NAME_PATTERN:?ARTIFACT_NAME_PATTERN is required}"

artifact_root_dir="$RUNNER_TEMP/ghcr-manager/download-run-artifacts/$GITHUB_RUN_ID"
download_dir="$artifact_root_dir/downloaded"
extract_dir="$artifact_root_dir/extracted"

mkdir -p "$download_dir" "$extract_dir"

artifact_list="$(
  gh api \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: $_GITHUB_API_VERSION" \
    "repos/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID/artifacts?per_page=100" \
    | jq -r --arg artifact_name_pattern "$ARTIFACT_NAME_PATTERN" '.artifacts[]
      | select(.name | test($artifact_name_pattern))
      | [.id, .name, .archive_download_url]
      | @tsv'
)"

if [[ -z "$artifact_list" ]]; then
  echo "No matching artifacts found to download." >&2
  exit 1
fi

while IFS=$'\t' read -r _artifact_id artifact_name artifact_url; do
  artifact_zip_path="$download_dir/${artifact_name}.zip"
  artifact_extract_dir="$extract_dir/$artifact_name"
  mkdir -p "$artifact_extract_dir"

  gh api \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: $_GITHUB_API_VERSION" \
    "$artifact_url" \
    > "$artifact_zip_path"

  unzip -q "$artifact_zip_path" -d "$artifact_extract_dir"
done <<< "$artifact_list"

printf '%s\n' "$extract_dir"
