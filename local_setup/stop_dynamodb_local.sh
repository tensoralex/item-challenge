#!/usr/bin/env bash
# College Board Item Management Exercise — stop DynamoDB Local.
#
# Stops the DynamoDB Local instance started by 04_start_dynamodb_local.sh.
# Runtime mode (jar or docker) is recorded in .runtime-mode at start time
# (selected via DDB_RUNTIME when starting — default jar).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

PID_FILE="${LOCAL_SETUP_DIR}/dynamodb-local.pid"
RUNTIME_MODE_FILE="${LOCAL_SETUP_DIR}/.runtime-mode"

log_section "Stopping DynamoDB Local"

RUNTIME_MODE=""
if [[ -f "${RUNTIME_MODE_FILE}" ]]; then
  RUNTIME_MODE="$(cat "${RUNTIME_MODE_FILE}")"
fi

if [[ "${RUNTIME_MODE}" == "docker" ]] && command_exists docker; then
  docker compose -f "${LOCAL_SETUP_DIR}/docker-compose.yml" down
  rm -f "${RUNTIME_MODE_FILE}"
  log_ok "Docker DynamoDB Local stopped."
  exit 0
fi

if [[ -f "${PID_FILE}" ]]; then
  PID="$(cat "${PID_FILE}")"
  if kill -0 "${PID}" 2>/dev/null; then
    kill "${PID}"
    log_ok "Stopped DynamoDB Local jar process (PID ${PID})."
  else
    log_warn "PID file found but process ${PID} is not running."
  fi
  rm -f "${PID_FILE}"
  rm -f "${RUNTIME_MODE_FILE}"
  exit 0
fi

# Fallback: try Docker if mode file is missing but container exists
if command_exists docker && docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^item-challenge-ddb$'; then
  docker compose -f "${LOCAL_SETUP_DIR}/docker-compose.yml" down
  log_ok "Docker DynamoDB Local stopped."
  exit 0
fi

log_warn "No running DynamoDB Local instance detected."
