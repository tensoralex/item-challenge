#!/usr/bin/env bash
# College Board Item Management Exercise — install CDK (infrastructure deps).
#
# Installs npm packages in infrastructure/ and verifies the local CDK CLI
# (npx cdk). Idempotent — safe to re-run.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

INFRA_DIR="${REPO_ROOT}/infrastructure"

log_section "Setting up AWS CDK (infrastructure/)"

if ! command_exists node; then
  log_error "Node.js is required. Run 01_check_prerequisites.sh first."
  exit 1
fi

if ! command_exists npm; then
  log_error "npm is required to install CDK dependencies in infrastructure/."
  log_info "npm ships with Node.js from https://nodejs.org/"
  exit 1
fi

if [[ ! -f "${INFRA_DIR}/package.json" ]]; then
  log_warn "No infrastructure/package.json found — skipping CDK setup."
  exit 0
fi

log_info "Installing infrastructure dependencies in ${INFRA_DIR}..."
cd "${INFRA_DIR}"
npm install

CDK_VERSION=""
if CDK_VERSION="$(npx --no-install cdk --version 2>/dev/null)"; then
  :
elif CDK_VERSION="$(npx cdk --version 2>/dev/null)"; then
  :
else
  log_error "CDK CLI not available after npm install."
  exit 1
fi

log_ok "CDK: ${CDK_VERSION} (local, via npx from infrastructure/)"
log_info "Synthesize: bash local_setup/run_local_infra.sh cdk"
