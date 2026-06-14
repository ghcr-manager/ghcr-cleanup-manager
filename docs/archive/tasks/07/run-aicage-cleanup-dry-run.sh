#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../../../.." && pwd)"

db_path="$repo_root/artifacts/aicage__aicage.sqlite"
summary_path="$repo_root/artifacts/aicage__aicage--delete-test-tags--dry-run-summary.json"

[[ -f "$db_path" ]] || {
  echo "Missing database: $db_path" >&2
  exit 1
}

cd "$repo_root"

npm run ghcr-cleanup-manager -- cleanup \
  --db "$db_path" \
  --owner aicage \
  --package aicage \
  --dry-run \
  --use-regex \
  --delete-tag '.*' \
  --keep-n-tagged 3 \
  --exclude-tags '^(claude|claude-2\\.1\\.150|codex|codex-0\\.133\\.0|copilot|copilot-1\\.0\\.51|crush|crush-0\\.71\\.0|droid|droid-0\\.132\\.0|gemini|gemini-0\\.43\\.0|goose|goose-1\\.35\\.0|opencode|opencode-1\\.15\\.10|qwen|qwen-0\\.16\\.0)-(alpine|debian|fedora|node|ubuntu)(-1\\.1\\.11)?(-(arm64|amd64))?$' \
  --older-than '30 days' \
  --delete-untagged \
  --summary-json-path "$summary_path" \
  --log-level "debug"
