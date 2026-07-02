#!/usr/bin/env bash
set -euo pipefail

readonly _GITHUB_API_VERSION="2022-11-28"

: "${GITHUB_TOKEN:?GITHUB_TOKEN is required}"
: "${ARTIFACT_LIST_PATH:?ARTIFACT_LIST_PATH is required}"

exclude_artifact_id="${EXCLUDE_ARTIFACT_ID:-}"
if [[ ! -s "$ARTIFACT_LIST_PATH" ]]; then
  exit 0
fi

while IFS=$'\t' read -r artifact_id artifact_name; do
  if [[ -n "$exclude_artifact_id" && "$artifact_id" == "$exclude_artifact_id" ]]; then
    continue
  fi
  gh api \
    -X DELETE \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: $_GITHUB_API_VERSION" \
    "repos/$GITHUB_REPOSITORY/actions/artifacts/$artifact_id" \
    > /dev/null
  echo "Deleted intermediate artifact: $artifact_name" >&2
done < "$ARTIFACT_LIST_PATH"
