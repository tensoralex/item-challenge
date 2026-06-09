#!/usr/bin/env bash
# College Board Item Management Exercise — start DynamoDB Local.
#
# Default runtime: Java jar (DDB_RUNTIME=jar) — tested on macOS without Docker.
# Opt-in runtime: Docker (DDB_RUNTIME=docker) — requires Docker + Compose.
#
# Persistence differs by runtime:
#   jar    — -sharedDb; table data persists across process restarts
#   docker — -inMemory; data wiped on container restart (table creation is idempotent)
#
# If a previous instance was killed, re-running this script recovers on demand.
#
# Docs: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DynamoDBLocal.html

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

DYNAMODB_PORT="${DYNAMODB_PORT:-8000}"
DYNAMODB_ENDPOINT="${DYNAMODB_ENDPOINT:-http://localhost:${DYNAMODB_PORT}}"
DDB_RUNTIME="${DDB_RUNTIME:-jar}"
DDB_DIR="${LOCAL_SETUP_DIR}/.dynamodb-local"
PID_FILE="${LOCAL_SETUP_DIR}/dynamodb-local.pid"
LOG_FILE="${LOCAL_SETUP_DIR}/dynamodb-local.log"
RUNTIME_MODE_FILE="${LOCAL_SETUP_DIR}/.runtime-mode"
ARCHIVE="dynamodb_local_latest.tar.gz"
DOWNLOAD_URL="https://d1ni2b6xgvw0s0.cloudfront.net/v2.x/${ARCHIVE}"

log_section "Starting DynamoDB Local on ${DYNAMODB_ENDPOINT} (runtime: ${DDB_RUNTIME})"

if dynamodb_local_ready; then
  log_ok "DynamoDB Local is already running."
  exit 0
fi

start_with_docker() {
  if ! command_exists docker; then
    log_error "Docker is required when DDB_RUNTIME=docker."
    exit 1
  fi
  if ! docker compose version >/dev/null 2>&1; then
    log_error "Docker Compose plugin is required when DDB_RUNTIME=docker."
    exit 1
  fi

  log_info "Using Docker (amazon/dynamodb-local image, opt-in via DDB_RUNTIME=docker)."
  docker compose -f "${LOCAL_SETUP_DIR}/docker-compose.yml" up -d
  echo "docker" > "${RUNTIME_MODE_FILE}"
}

start_with_jar() {
  if ! command_exists java; then
    log_error "Java 17+ is required for the default jar runtime (DDB_RUNTIME=jar)."
    exit 1
  fi

  log_info "Using DynamoDB Local Java jar (default runtime)."

  mkdir -p "${DDB_DIR}"

  if [[ ! -f "${DDB_DIR}/DynamoDBLocal.jar" ]]; then
    log_info "Downloading DynamoDB Local..."
    if ! command_exists curl; then
      log_error "curl is required to download DynamoDB Local."
      exit 1
    fi
    curl -fsSL "${DOWNLOAD_URL}" -o "${DDB_DIR}/${ARCHIVE}"
    tar -xzf "${DDB_DIR}/${ARCHIVE}" -C "${DDB_DIR}"
  fi

  (
    cd "${DDB_DIR}"
    nohup java -Djava.library.path=./DynamoDBLocal_lib \
      -jar DynamoDBLocal.jar -sharedDb -port "${DYNAMODB_PORT}" \
      > "${LOG_FILE}" 2>&1 &
    echo $! > "${PID_FILE}"
  )

  echo "jar" > "${RUNTIME_MODE_FILE}"
  log_info "DynamoDB Local jar started (PID $(cat "${PID_FILE}"), log: ${LOG_FILE})."
}

# On-demand recovery: if a previous instance was recorded but is no longer
# running, clean up the stale marker and restart. If it is still booting,
# skip launching a second copy and just wait for readiness.
ALREADY_STARTING=0
if [[ -f "${PID_FILE}" ]]; then
  RECORDED_PID="$(cat "${PID_FILE}")"
  if [[ -n "${RECORDED_PID}" ]] && kill -0 "${RECORDED_PID}" 2>/dev/null; then
    log_info "A previous instance (PID ${RECORDED_PID}) is still starting; waiting for readiness."
    ALREADY_STARTING=1
  else
    log_warn "Previous DynamoDB Local instance is no longer running; recovering."
    rm -f "${PID_FILE}"
  fi
fi

if [[ "${ALREADY_STARTING}" -eq 0 ]]; then
  case "${DDB_RUNTIME}" in
    jar)
      start_with_jar
      ;;
    docker)
      start_with_docker
      ;;
    *)
      log_error "Invalid DDB_RUNTIME='${DDB_RUNTIME}' (use 'jar' or 'docker')."
      log_info "  Default:  bash local_setup/run_local_infra.sh up"
      log_info "  Docker:   DDB_RUNTIME=docker bash local_setup/run_local_infra.sh up"
      exit 1
      ;;
  esac
fi

# Wait for readiness (up to 30 seconds)
for _ in $(seq 1 30); do
  if dynamodb_local_ready; then
    log_ok "DynamoDB Local is ready at ${DYNAMODB_ENDPOINT}"
    exit 0
  fi
  sleep 1
done

log_error "DynamoDB Local did not become ready within 30 seconds."
if [[ -f "${LOG_FILE}" ]]; then
  log_info "Last lines from ${LOG_FILE}:"
  tail -n 20 "${LOG_FILE}" || true
fi
exit 1
