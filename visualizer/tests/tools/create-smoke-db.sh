#!/usr/bin/env bash

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 <db-path>" >&2
  exit 1
fi

DB_PATH="$1"
DB_DIR="$(dirname "$DB_PATH")"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

mkdir -p "$DB_DIR"
rm -f "$DB_PATH"

for directory_name in schema views; do
  sql_directory="${REPO_ROOT}/resources/sql/${directory_name}"
  while IFS= read -r sql_file; do
    sqlite3 "$DB_PATH" < "$sql_file"
  done < <(find "$sql_directory" -maxdepth 1 -type f -name '*.sql' | sort)
done

sqlite3 "$DB_PATH" <<'SQL'
INSERT INTO package_scans(
  scan_uuid,
  owner,
  package_name,
  package_metadata_json,
  github_actions_run_url,
  scan_started_at,
  scan_completed_at,
  status
)
VALUES(
  'scan-uuid-smoke',
  'acme',
  'demo',
  '{"visibility":"private"}',
  NULL,
  '2026-06-08T10:00:00.000Z',
  '2026-06-08T10:00:00.000Z',
  'completed'
);

INSERT INTO package_versions(scan_id, version_id, created_at, updated_at)
VALUES(1, 1, '2026-06-08T10:00:00.000Z', '2026-06-08T10:00:00.000Z');

INSERT INTO tags(scan_id, tag, version_id, is_digest_tag)
VALUES(1, 'single', 1, 0);

INSERT INTO manifests(
  scan_id,
  version_id,
  digest,
  media_type,
  artifact_type,
  config_media_type,
  subject_digest,
  annotations_json,
  manifest_kind
)
VALUES(
  1,
  1,
  'sha256:center',
  'application/vnd.oci.image.index.v1+json',
  NULL,
  NULL,
  NULL,
  NULL,
  'multi_arch_manifest'
);
SQL
