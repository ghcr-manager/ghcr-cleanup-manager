#!/usr/bin/env bash
set -euo pipefail

readonly _GITHUB_API_VERSION="2022-11-28"

: "${GH_TOKEN:?GH_TOKEN is required}"
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
: "${GITHUB_RUN_ID:?GITHUB_RUN_ID is required}"
: "${ARTIFACT_NAME_PATTERN:?ARTIFACT_NAME_PATTERN is required}"

artifact_list="$(
  gh api \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: $_GITHUB_API_VERSION" \
    "repos/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID/artifacts?per_page=100" \
    | jq -r --arg artifact_name_pattern "$ARTIFACT_NAME_PATTERN" '.artifacts[]
      | select(.name | test($artifact_name_pattern))
      | [.id, .name]
      | @tsv'
)"

if [[ -z "$artifact_list" ]]; then
  exit 0
fi

while IFS=$'\t' read -r artifact_id artifact_name; do
  gh api \
    -X DELETE \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: $_GITHUB_API_VERSION" \
    "repos/$GITHUB_REPOSITORY/actions/artifacts/$artifact_id" \
    > /dev/null
  echo "Deleted intermediate artifact: $artifact_name" >&2
done <<< "$artifact_list"
