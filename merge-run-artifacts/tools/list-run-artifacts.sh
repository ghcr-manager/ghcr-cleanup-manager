#!/usr/bin/env bash
set -euo pipefail

readonly _GITHUB_API_VERSION="2022-11-28"

: "${GITHUB_TOKEN:?GITHUB_TOKEN is required}"
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
: "${GITHUB_RUN_ID:?GITHUB_RUN_ID is required}"
: "${ARTIFACT_NAME_GLOB:?ARTIFACT_NAME_GLOB is required}"

while IFS=$'\t' read -r artifact_id artifact_name; do
  # shellcheck disable=SC2254
  case "$artifact_name" in
    $ARTIFACT_NAME_GLOB) printf '%s\t%s\n' "$artifact_id" "$artifact_name" ;;
    *) ;;
  esac
done < <(
  gh api \
    --paginate \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: $_GITHUB_API_VERSION" \
    "repos/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID/artifacts?per_page=100" \
    | jq -r '.artifacts[] | [.id, .name] | @tsv'
)
