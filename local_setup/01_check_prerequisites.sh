#!/usr/bin/env bash
# College Board Item Management Exercise — prerequisite check.
#
# Verifies tools required to run the API locally with DynamoDB Local.
# Default runtime is Java jar (DDB_RUNTIME=jar); Docker is opt-in only.
# Does not install system packages; prints install guidance when missing.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

DDB_RUNTIME="${DDB_RUNTIME:-jar}"

log_section "Checking prerequisites for local development (DDB_RUNTIME=${DDB_RUNTIME})"

MISSING_HARD=0
HAS_DOCKER=0
HAS_DOCKER_COMPOSE=0
HAS_JAVA=0

report_tool() {
  local name="$1"
  local cmd="$2"
  local required="$3" # hard | optional | one_of

  if command_exists "$cmd"; then
    local version
    version=$("$cmd" --version 2>&1 | head -n 1 || true)
    log_ok "${name}: ${version}"
    return 0
  fi

  if [[ "$required" == "hard" ]]; then
    log_error "${name}: not found (required)"
    MISSING_HARD=1
  elif [[ "$required" == "one_of" ]]; then
    log_warn "${name}: not found (needed if Docker is unavailable)"
  else
    log_warn "${name}: not found (optional)"
  fi
  return 1
}

# Node.js 22+ for local tooling (Lambda runtime in CDK stack is NODEJS_22_X)
if command_exists node; then
  NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
  NODE_VERSION="$(node --version)"
  if [[ "${NODE_MAJOR}" -ge 22 ]]; then
    log_ok "Node.js: ${NODE_VERSION}"
  else
    log_error "Node.js: ${NODE_VERSION} found, but version 22+ is required"
    MISSING_HARD=1
  fi
else
  log_error "Node.js: not found (required, version 22+)"
  MISSING_HARD=1
fi

if command_exists pnpm; then
  log_ok "pnpm: $(pnpm --version)"
else
  log_info "pnpm: not found (will be installed automatically in next step)"
fi
report_tool "npm" "npm" "optional" || true
report_tool "AWS CLI" "aws" "hard" || true

if command_exists cdk; then
  log_ok "CDK (global): $(cdk --version 2>&1 | head -n 1)"
else
  log_info "CDK: not installed globally (local CLI installed by 06_setup_cdk.sh via npx)"
fi

if command_exists docker; then
  HAS_DOCKER=1
  log_ok "Docker: $(docker --version 2>&1 | head -n 1)"
  if docker compose version >/dev/null 2>&1; then
    HAS_DOCKER_COMPOSE=1
    log_ok "Docker Compose: $(docker compose version 2>&1 | head -n 1)"
  else
    log_warn "Docker Compose plugin not found (docker compose)"
  fi
else
  if [[ "${DDB_RUNTIME}" == "docker" ]]; then
    log_error "Docker: not found (required when DDB_RUNTIME=docker)"
    MISSING_HARD=1
  else
    log_info "Docker: not found (optional — only needed with DDB_RUNTIME=docker)"
  fi
fi

if command_exists java && java -version >/dev/null 2>&1; then
  HAS_JAVA=1
  JAVA_VERSION="$(java -version 2>&1 | head -n 1)"
  log_ok "Java: ${JAVA_VERSION}"
else
  if [[ "${DDB_RUNTIME}" == "docker" ]]; then
    log_info "Java: not found (not required when DDB_RUNTIME=docker)"
  else
    log_error "Java: not found (required for default jar runtime, Java 17+)"
    MISSING_HARD=1
  fi
fi

# Mode-specific hard requirements
if [[ "${DDB_RUNTIME}" == "docker" ]]; then
  if [[ "${HAS_DOCKER}" -eq 0 || "${HAS_DOCKER_COMPOSE}" -eq 0 ]]; then
    log_error "DynamoDB Local (docker): Docker and Docker Compose are required when DDB_RUNTIME=docker"
    MISSING_HARD=1
  fi
else
  if [[ "${HAS_JAVA}" -eq 0 ]]; then
    log_error "DynamoDB Local (jar): Java 17+ is required for the default runtime"
    MISSING_HARD=1
  fi
  report_tool "curl" "curl" "optional" || log_info "curl: needed on first jar download if DynamoDB Local is not cached"
fi

if [[ "${MISSING_HARD}" -ne 0 ]]; then
  echo ""
  log_section "Install guidance"
  log_info "Node.js 22+: https://nodejs.org/  (or: brew install node)"
  log_info "AWS CLI v2: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html"
  log_info "Java 17+ (default jar runtime): https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DynamoDBLocal.html"
  log_info "Docker (opt-in, DDB_RUNTIME=docker): https://docs.docker.com/get-docker/"
  echo ""
  exit 1
fi

log_info "Prerequisite check passed."
exit 0
