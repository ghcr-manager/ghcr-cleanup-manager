#!/usr/bin/env bash

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 <image-ref>" >&2
  exit 1
fi

IMAGE_REF="$1"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
DB_PATH="${TMP_DIR}/smoke.sqlite"
PORT=18080
CONTAINER_NAME="ghcr-cleanup-manager-visualizer-smoke-${RANDOM}"

cleanup() {
  docker logs "$CONTAINER_NAME" >/dev/null 2>&1 && docker logs "$CONTAINER_NAME" || true
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

"${REPO_ROOT}/tools/create-visualizer-smoke-db.sh" "$DB_PATH"

docker run -d \
  --rm \
  --name "$CONTAINER_NAME" \
  -p "${PORT}:8080" \
  -v "${TMP_DIR}:/data:ro" \
  "$IMAGE_REF" \
  --db /data/smoke.sqlite \
  >/dev/null

for attempt in $(seq 1 30); do
  if response="$(curl -fsS "http://127.0.0.1:${PORT}/api/owners" 2>/dev/null)"; then
    if [[ "$response" == '[{"owner":"acme"}]' ]]; then
      exit 0
    fi

    echo "unexpected /api/owners response on attempt $attempt: $response" >&2
    exit 1
  fi

  sleep 1
done

echo "visualizer container did not become ready in time" >&2
exit 1
