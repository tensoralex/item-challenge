#!/usr/bin/env bash
# Shared helpers for local_setup scripts (exam item management exercise).

set -euo pipefail

# Resolve local_setup/ and repository root regardless of caller cwd.
LOCAL_SETUP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "${LOCAL_SETUP_DIR}/.." && pwd)"

log_section() {
  echo ""
  echo "==> $1"
}

log_info() {
  echo "    $1"
}

log_ok() {
  echo "    [ok] $1"
}

log_warn() {
  echo "    [warn] $1"
}

log_error() {
  echo "    [error] $1" >&2
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

# Returns 0 when DynamoDB Local responds on the configured endpoint.
dynamodb_local_ready() {
  local endpoint="${DYNAMODB_ENDPOINT:-http://localhost:8000}"
  AWS_REGION="${AWS_REGION:-us-east-1}" \
  AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-local}" \
  AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-local}" \
    aws dynamodb list-tables --endpoint-url "$endpoint" >/dev/null 2>&1
}
