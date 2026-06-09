#!/usr/bin/env bash
# College Board Item Management Exercise — Node.js and pnpm setup.
#
# Ensures pnpm is available via corepack or npm for installing project dependencies.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

log_section "Setting up pnpm"

if ! command_exists node; then
  log_error "Node.js is required. Run 01_check_prerequisites.sh first."
  exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [[ "${NODE_MAJOR}" -lt 22 ]]; then
  log_error "Node.js 22+ is required (found major version ${NODE_MAJOR})."
  exit 1
fi

# Already have pnpm? Nothing to do.
if command_exists pnpm; then
  log_ok "pnpm: $(pnpm --version)"
  exit 0
fi

# Prefer corepack (bundled with nodejs.org installers); fall back to npm
# (Homebrew's node formula does not ship corepack).
if command_exists corepack; then
  corepack enable
  corepack prepare pnpm@latest --activate
elif command_exists npm; then
  log_warn "corepack not found; installing pnpm via npm instead."
  npm install -g pnpm
else
  log_error "Neither corepack nor npm is available to install pnpm."
  log_info "Install Node.js 22+ from https://nodejs.org/ (includes corepack)."
  exit 1
fi

log_ok "pnpm: $(pnpm --version)"
