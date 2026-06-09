#!/usr/bin/env bash
# College Board Item Management Exercise — install project dependencies.
#
# Installs npm packages defined in package.json (handlers, AWS SDK, tests).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

log_section "Installing project dependencies"

if ! command_exists pnpm; then
  log_error "pnpm is not available. Run 02_setup_node_pnpm.sh first."
  exit 1
fi

cd "${REPO_ROOT}"
pnpm install

log_ok "Dependencies installed in ${REPO_ROOT}"
