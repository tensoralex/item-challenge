#!/usr/bin/env bash
# College Board Item Management Exercise — local environment bootstrap.
#
# Runs all local setup steps in order:
#   1. Check prerequisites
#   2. Enable pnpm
#   3. Install project dependencies
#   4. Start DynamoDB Local
#   5. Create the ExamItems table
#   6. Install CDK (infrastructure deps)
#
# Usage (from repository root):
#   bash local_setup/setup_all.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

echo "College Board — Exam Item Management Exercise"
echo "Local setup bootstrap"
echo "Repository: ${REPO_ROOT}"

run_step() {
  local script_name="$1"
  log_section "Running ${script_name}"
  bash "${SCRIPT_DIR}/${script_name}"
}

# Non-fatal step — offline npm must not block local DynamoDB bootstrap.
run_step_optional() {
  local script_name="$1"
  log_section "Running ${script_name} (optional)"
  if bash "${SCRIPT_DIR}/${script_name}"; then
    return 0
  fi
  log_warn "${script_name} failed (non-fatal). CDK synth can be retried later:"
  log_info "  bash local_setup/run_local_infra.sh cdk"
  return 0
}

run_step "01_check_prerequisites.sh"
run_step "02_setup_node_pnpm.sh"
run_step "03_install_project_deps.sh"
run_step "04_start_dynamodb_local.sh"
run_step "05_create_local_table.sh"
run_step_optional "06_setup_cdk.sh"

log_section "Local setup complete"
log_info "DynamoDB Local: ${DYNAMODB_ENDPOINT:-http://localhost:8000}"
log_info "Table name: ${DYNAMODB_TABLE_NAME:-ExamItems}"
echo ""
log_info "Next steps:"
log_info "  One-command lifecycle:  bash local_setup/run_local_infra.sh up"
log_info "  API (DynamoDB default): pnpm dev"
log_info "  API (in-memory):        pnpm dev:memory"
log_info "  Stop DynamoDB Local:    bash local_setup/run_local_infra.sh down"
log_info "  Test endpoints:         see GETTING_STARTED.md"
log_info "  Synthesize infra:       bash local_setup/run_local_infra.sh cdk"
echo ""
