#!/usr/bin/env bash
# College Board Item Management Exercise — local infrastructure lifecycle.
#
# One entry point for bringing local DynamoDB infrastructure up, down, or
# checking status. Wraps setup_all.sh, .env provisioning, and stop scripts.
#
# Usage (from repository root):
#   bash local_setup/run_local_infra.sh [up|down|restart|reset|status|inspect|cdk|synth|help]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

COMMAND="${1:-up}"
ENV_FILE="${REPO_ROOT}/.env"
ENV_EXAMPLE="${LOCAL_SETUP_DIR}/.env.example"
PID_FILE="${LOCAL_SETUP_DIR}/dynamodb-local.pid"
RUNTIME_MODE_FILE="${LOCAL_SETUP_DIR}/.runtime-mode"
TABLE="${DYNAMODB_TABLE_NAME:-ExamItems}"
ENDPOINT="${DYNAMODB_ENDPOINT:-http://localhost:8000}"

print_usage() {
  cat <<EOF
College Board — Exam Item Management Exercise
Local infrastructure lifecycle

Usage:
  bash local_setup/run_local_infra.sh up       Full bootstrap + .env (default)
  bash local_setup/run_local_infra.sh down     Stop DynamoDB Local
  bash local_setup/run_local_infra.sh restart  Stop, start DynamoDB, ensure table
  bash local_setup/run_local_infra.sh reset    Drop and recreate ExamItems table
  bash local_setup/run_local_infra.sh status   Report DynamoDB and table state
  bash local_setup/run_local_infra.sh inspect    Scan table + verify content invariants
  bash local_setup/run_local_infra.sh cdk      Install CDK deps and run cdk synth
  bash local_setup/run_local_infra.sh synth      Alias for cdk
  bash local_setup/run_local_infra.sh help     Show this help

Environment:
  DDB_RUNTIME=jar|docker   DynamoDB Local runtime (default: jar, tested on macOS)
  Example (Docker opt-in):
    DDB_RUNTIME=docker bash local_setup/run_local_infra.sh up

EOF
}

ensure_env_file() {
  if [[ -f "${ENV_FILE}" ]]; then
    log_ok ".env already exists at ${ENV_FILE}"
    return 0
  fi

  if [[ ! -f "${ENV_EXAMPLE}" ]]; then
    log_error "Missing ${ENV_EXAMPLE}"
    exit 1
  fi

  cp "${ENV_EXAMPLE}" "${ENV_FILE}"
  log_ok "Created ${ENV_FILE} from local_setup/.env.example"
}

print_next_steps() {
  echo ""
  log_section "Next steps"
  log_info "  API (DynamoDB):    pnpm dev"
  log_info "  API (in-memory):   pnpm dev:memory"
  log_info "  Stop DynamoDB:     bash local_setup/run_local_infra.sh down"
  log_info "  Check status:      bash local_setup/run_local_infra.sh status"
  log_info "  Inspect table:     bash local_setup/run_local_infra.sh inspect"
  log_info "  Synthesize infra:  bash local_setup/run_local_infra.sh cdk"
  echo ""
}

cmd_up() {
  log_section "Bringing local infrastructure up"
  bash "${SCRIPT_DIR}/setup_all.sh"
  ensure_env_file
  print_next_steps
}

cmd_down() {
  bash "${SCRIPT_DIR}/stop_dynamodb_local.sh"
}

cmd_restart() {
  log_section "Restarting DynamoDB Local"
  bash "${SCRIPT_DIR}/stop_dynamodb_local.sh" || true
  bash "${SCRIPT_DIR}/04_start_dynamodb_local.sh"
  bash "${SCRIPT_DIR}/05_create_local_table.sh"
  log_ok "DynamoDB Local restarted and table verified."
}

cmd_reset() {
  log_section "Resetting DynamoDB table (clean slate)"
  bash "${SCRIPT_DIR}/04_start_dynamodb_local.sh"
  bash "${SCRIPT_DIR}/05_create_local_table.sh" --reset
  log_ok "Table '${TABLE}' reset complete."
}

cmd_cdk() {
  log_section "CDK synth (infrastructure/)"
  bash "${SCRIPT_DIR}/06_setup_cdk.sh"
  cd "${REPO_ROOT}/infrastructure"
  # Pass through extra args (e.g. stack name) after the subcommand.
  shift
  npx cdk synth "$@"
  log_ok "CloudFormation template written to infrastructure/cdk.out/"
}

cmd_inspect() {
  log_section "DynamoDB table inspector"
  cd "${REPO_ROOT}"
  pnpm db:inspect
}

cmd_status() {
  log_section "Local infrastructure status"
  log_info "Endpoint: ${ENDPOINT}"
  log_info "Table: ${TABLE}"

  if [[ -f "${RUNTIME_MODE_FILE}" ]]; then
    log_info "Runtime mode: $(cat "${RUNTIME_MODE_FILE}")"
  else
    log_info "Runtime mode: (not recorded)"
  fi

  if [[ -f "${PID_FILE}" ]]; then
    RECORDED_PID="$(cat "${PID_FILE}")"
    if [[ -n "${RECORDED_PID}" ]] && kill -0 "${RECORDED_PID}" 2>/dev/null; then
      log_ok "Jar process: running (PID ${RECORDED_PID})"
    else
      log_warn "Jar process: not running (stale PID ${RECORDED_PID:-unknown})"
    fi
  else
    log_info "Jar process: no PID file"
  fi

  if dynamodb_local_ready; then
    log_ok "DynamoDB Local: ready"
  else
    log_warn "DynamoDB Local: not reachable"
  fi

  export AWS_REGION="${AWS_REGION:-us-east-1}"
  export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-local}"
  export AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-local}"

  if aws dynamodb describe-table --table-name "${TABLE}" --endpoint-url "${ENDPOINT}" >/dev/null 2>&1; then
    GSI_PROJ="$(aws dynamodb describe-table \
      --table-name "${TABLE}" \
      --endpoint-url "${ENDPOINT}" \
      --query 'Table.GlobalSecondaryIndexes[?IndexName==`GSI1`].Projection.ProjectionType | [0]' \
      --output text 2>/dev/null || echo "unknown")"
    log_ok "Table '${TABLE}': exists (GSI1 projection: ${GSI_PROJ})"
  else
    log_warn "Table '${TABLE}': not found"
  fi

  if [[ -f "${ENV_FILE}" ]]; then
    log_ok ".env: present"
  else
    log_warn ".env: missing (run 'up' or copy local_setup/.env.example)"
  fi
}

case "${COMMAND}" in
  up)
    cmd_up
    ;;
  down)
    cmd_down
    ;;
  restart)
    cmd_restart
    ;;
  reset)
    cmd_reset
    ;;
  status)
    cmd_status
    ;;
  inspect)
    cmd_inspect
    ;;
  cdk|synth)
    cmd_cdk "$@"
    ;;
  help|-h|--help)
    print_usage
    ;;
  *)
    log_error "Unknown command: ${COMMAND}"
    print_usage
    exit 1
    ;;
esac
