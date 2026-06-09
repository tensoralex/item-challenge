#!/usr/bin/env bash
# Panel demo script — 12-step API narrative against local DynamoDB.
#
# Steps 1-11: live curl calls exercising all six endpoints + error paths.
# Step 12:    pnpm db:inspect — METADATA/VERSION parity, sparse GSI invariants.
#
# Usage (from repository root):
#   bash demo.sh           # API walkthrough + db:inspect
#   bash demo.sh --full    # walkthrough + all test suites + dev/prod synth
#   pnpm demo              # alias for bash demo.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=local_setup/lib/common.sh
source "${SCRIPT_DIR}/local_setup/lib/common.sh"

FULL_MODE=false
if [[ "${1:-}" == "--full" ]]; then
  FULL_MODE=true
elif [[ -n "${1:-}" ]]; then
  log_error "Unknown argument: $1 (use --full or no args)"
  exit 1
fi

API_PORT="${PORT:-3000}"
BASE_URL="http://127.0.0.1:${API_PORT}"
SERVER_PID=""
STARTED_SERVER=false
DEMO_SUBJECT="AP Biology panel demo $(date +%H%M%S)"
ABSENT_ITEM_ID="00000000-0000-4000-8000-000000000000"
SAMPLE_FILE="${SCRIPT_DIR}/samples/sample-item.json"

if [[ ! -f "${SAMPLE_FILE}" ]]; then
  log_error "Missing ${SAMPLE_FILE}"
  exit 1
fi

if command_exists jq; then
  CREATE_PAYLOAD="$(jq --arg subject "${DEMO_SUBJECT}" '.subject = $subject' "${SAMPLE_FILE}")"
else
  CREATE_PAYLOAD="$(python -c "
import json, sys
with open('${SAMPLE_FILE}') as f:
    data = json.load(f)
data['subject'] = '''${DEMO_SUBJECT}'''
print(json.dumps(data))
")"
fi

UPDATE_PAYLOAD='{"difficulty":4,"metadata":{"status":"review"}}'
INVALID_PAYLOAD='{"unknownField":true}'

LAST_HTTP_STATUS=""
LAST_HTTP_BODY=""

cleanup() {
  if [[ "${STARTED_SERVER}" == "true" && -n "${SERVER_PID}" ]]; then
    log_info "Stopping demo API server (pid ${SERVER_PID})"
    kill "${SERVER_PID}" 2>/dev/null || true
    wait "${SERVER_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

pretty_json() {
  if command_exists jq; then
    jq .
  elif command_exists python; then
    python -m json.tool
  else
    cat
  fi
}

json_field() {
  local field="$1"
  if command_exists jq; then
    echo "${LAST_HTTP_BODY}" | jq -r ".${field}"
  else
    echo "${LAST_HTTP_BODY}" | python -c "import sys,json; print(json.load(sys.stdin)['${field}'])"
  fi
}

# Probe our API via CORS preflight (204 = this app; id-format agnostic).
probe_api_server() {
  local code
  code="$(curl -s -o /dev/null -w "%{http_code}" -X OPTIONS "${BASE_URL}/api/items" 2>/dev/null)" || true
  echo "${code:-000}"
}

# Converge on a live API server — start one if absent; leave external servers alone.
ensure_server() {
  local code
  code="$(probe_api_server)"

  if [[ "${code}" == "204" ]]; then
    if [[ "${STARTED_SERVER}" == "true" ]]; then
      log_ok "Demo API server ready at ${BASE_URL} (pid ${SERVER_PID})"
    else
      log_ok "Using API server already running at ${BASE_URL}"
    fi
    return 0
  fi

  if [[ "${code}" != "000" ]]; then
    log_error "Port ${API_PORT} is in use by a non-API process (OPTIONS returned HTTP ${code})"
    log_error "Try: PORT=3001 bash demo.sh"
    exit 1
  fi

  # Connection refused — start or restart our server if needed.
  if [[ "${STARTED_SERVER}" == "true" && -n "${SERVER_PID}" ]]; then
    if ! kill -0 "${SERVER_PID}" 2>/dev/null; then
      log_warn "Demo server (pid ${SERVER_PID}) exited — restarting"
      STARTED_SERVER=false
      SERVER_PID=""
    fi
  fi

  if [[ "${STARTED_SERVER}" != "true" ]]; then
    log_info "Starting API server on port ${API_PORT}"
    (
      cd "${REPO_ROOT}"
      npx tsx --env-file-if-exists=.env src/server.ts
    ) >/tmp/item-challenge-demo-server.log 2>&1 &
    SERVER_PID=$!
    STARTED_SERVER=true
  fi

  for _ in $(seq 1 40); do
    code="$(probe_api_server)"
    if [[ "${code}" == "204" ]]; then
      log_ok "API server ready at ${BASE_URL} (pid ${SERVER_PID})"
      return 0
    fi
    sleep 0.25
  done

  log_error "API server did not become ready — see /tmp/item-challenge-demo-server.log"
  exit 1
}

step_header() {
  log_section "Step ${1}: ${2}"
}

# Perform HTTP call; sets LAST_HTTP_STATUS and LAST_HTTP_BODY; prints curl + response.
api_demo() {
  local description="$1"
  shift

  log_info "${description}"
  local curl_cmd="curl -sS"
  local arg
  for arg in "$@"; do
    curl_cmd+=" $(printf '%q' "${arg}")"
  done
  log_info "  ${curl_cmd}"

  local raw
  if ! raw="$(curl -sS -w $'\n__HTTP_STATUS__:%{http_code}' "$@" 2>/dev/null)"; then
    log_warn "Connection failed — ensuring API server is up and retrying once"
    ensure_server
    if ! raw="$(curl -sS -w $'\n__HTTP_STATUS__:%{http_code}' "$@" 2>/dev/null)"; then
      log_error "Request failed after retry — server may have died (see /tmp/item-challenge-demo-server.log)"
      exit 1
    fi
  fi
  LAST_HTTP_BODY="${raw%$'\n'__HTTP_STATUS__:*}"
  LAST_HTTP_STATUS="${raw##*__HTTP_STATUS__:}"

  echo ""
  echo "${LAST_HTTP_BODY}" | pretty_json
  echo ""
  log_ok "HTTP ${LAST_HTTP_STATUS}"
}

ensure_preflight() {
  log_section "Preflight"
  if ! dynamodb_local_ready; then
    log_warn "DynamoDB Local not reachable — running local_setup/run_local_infra.sh up"
    bash "${REPO_ROOT}/local_setup/run_local_infra.sh" up
  else
    log_ok "DynamoDB Local is up"
  fi

  ensure_server
}

run_api_demo() {
  local item_id audit_count

  # Steps 1-3: happy path — create (v1), read, update with If-Match (v2).
  # Steps 4-6: error paths — stale write 409, validation 400, bad If-Match 400.
  # Steps 7-9: list (GSI1 summaries), version checkpoint (v3), audit trail (3 versions).
  # Steps 10-11: malformed id 400, absent id 404.
  # Step 12: db:inspect invariants (outside api_demo calls).

  # Re-probe before first request — closes stale-server race from preflight.
  ensure_server

  step_header 1 "Create item (POST /api/items → 201, version 1)"
  api_demo "Create a new exam item" \
    -X POST "${BASE_URL}/api/items" \
    -H "Content-Type: application/json" \
    -d "${CREATE_PAYLOAD}"
  [[ "${LAST_HTTP_STATUS}" == "201" ]] || { log_error "Expected HTTP 201 on create"; exit 1; }
  item_id="$(json_field id)"
  log_ok "Captured item id: ${item_id}"

  step_header 2 "Read item (GET /api/items/:id → 200)"
  api_demo "Fetch the item we just created" \
    -X GET "${BASE_URL}/api/items/${item_id}"
  [[ "${LAST_HTTP_STATUS}" == "200" ]] || { log_error "Expected HTTP 200 on get"; exit 1; }

  step_header 3 "Update with optimistic lock (PUT + If-Match: 1 → 200, version 2)"
  api_demo "Update difficulty and status with If-Match: 1" \
    -X PUT "${BASE_URL}/api/items/${item_id}" \
    -H "Content-Type: application/json" \
    -H "If-Match: 1" \
    -d "${UPDATE_PAYLOAD}"
  [[ "${LAST_HTTP_STATUS}" == "200" ]] || { log_error "Expected HTTP 200 on update"; exit 1; }

  step_header 4 "Stale write rejected (PUT + If-Match: 1 again → 409)"
  api_demo "Demonstrate optimistic locking — stale version should conflict" \
    -X PUT "${BASE_URL}/api/items/${item_id}" \
    -H "Content-Type: application/json" \
    -H "If-Match: 1" \
    -d "${UPDATE_PAYLOAD}"
  [[ "${LAST_HTTP_STATUS}" == "409" ]] || { log_error "Expected HTTP 409 on stale write"; exit 1; }

  step_header 5 "Validation rejected (POST with unknown field → 400)"
  api_demo "Reject client-supplied unknown fields and missing required shape" \
    -X POST "${BASE_URL}/api/items" \
    -H "Content-Type: application/json" \
    -d "${INVALID_PAYLOAD}"
  [[ "${LAST_HTTP_STATUS}" == "400" ]] || { log_error "Expected HTTP 400 on validation failure"; exit 1; }

  step_header 6 "Malformed If-Match (PUT + If-Match: abc → 400)"
  api_demo "Reject non-numeric If-Match header" \
    -X PUT "${BASE_URL}/api/items/${item_id}" \
    -H "Content-Type: application/json" \
    -H "If-Match: abc" \
    -d "${UPDATE_PAYLOAD}"
  [[ "${LAST_HTTP_STATUS}" == "400" ]] || { log_error "Expected HTTP 400 on invalid If-Match"; exit 1; }

  step_header 7 "List by subject (GET /api/items?subject= → summaries, no content)"
  local encoded_subject
  encoded_subject="$(python -c "import urllib.parse; print(urllib.parse.quote('''${DEMO_SUBJECT}'''))")"
  api_demo "Query GSI1 by subject — list responses omit content (answers)" \
    -X GET "${BASE_URL}/api/items?subject=${encoded_subject}"
  [[ "${LAST_HTTP_STATUS}" == "200" ]] || { log_error "Expected HTTP 200 on list"; exit 1; }

  step_header 8 "Version checkpoint (POST /api/items/:id/versions → 201, version 3)"
  api_demo "Explicit checkpoint without content change" \
    -X POST "${BASE_URL}/api/items/${item_id}/versions"
  [[ "${LAST_HTTP_STATUS}" == "201" ]] || { log_error "Expected HTTP 201 on create version"; exit 1; }

  step_header 9 "Audit trail (GET /api/items/:id/audit → 3 versions)"
  api_demo "Show immutable version history" \
    -X GET "${BASE_URL}/api/items/${item_id}/audit"
  [[ "${LAST_HTTP_STATUS}" == "200" ]] || { log_error "Expected HTTP 200 on audit"; exit 1; }
  if command_exists jq; then
    audit_count="$(echo "${LAST_HTTP_BODY}" | jq -r '.total // (.versions | length)' 2>/dev/null || echo "?")"
  else
    audit_count="(see response above)"
  fi
  log_ok "Audit entries: ${audit_count}"

  step_header 10 "Malformed id (GET bad id → 400)"
  api_demo "Reject non-UUID item ids before DynamoDB round-trip" \
    -X GET "${BASE_URL}/api/items/not-a-uuid"
  [[ "${LAST_HTTP_STATUS}" == "400" ]] || { log_error "Expected HTTP 400 on malformed id"; exit 1; }

  step_header 11 "Not found (GET valid-but-absent uuid → 404)"
  api_demo "Return 404 for missing item" \
    -X GET "${BASE_URL}/api/items/${ABSENT_ITEM_ID}"
  [[ "${LAST_HTTP_STATUS}" == "404" ]] || { log_error "Expected HTTP 404 on missing item"; exit 1; }

  step_header 12 "Data invariants (pnpm db:inspect)"
  log_info "Verify METADATA/VERSION parity, contiguous versions, sparse GSI"
  (
    cd "${REPO_ROOT}"
    pnpm db:inspect
  )
}

run_full_validation() {
  log_section "Full validation (--full)"
  (
    cd "${REPO_ROOT}"
    pnpm test
    pnpm test:e2e
    cd infrastructure && npm test
    npx cdk synth
    npx cdk synth -c env=prod
  )
  log_ok "All test suites and synth commands completed"
}

print_summary() {
  log_section "Summary — what to show the panel"
  log_info "Implemented: 6/6 endpoints — CRUD, list (GSI1), version checkpoint, audit"
  log_info "Roadmap: GSI2 global recency, auth, DLQ, Streams-based audit — see ARCHITECTURE.md"
  log_info "Tests: pnpm test, pnpm test:e2e, cd infrastructure && npm test"
  log_info "Lint/format: pnpm lint, pnpm format:check"
  log_info "Synth: pnpm synth (dev), cd infrastructure && npx cdk synth -c env=prod"
  log_info "Docs: ARCHITECTURE.md, EXERCISE_DOCUMENTATION.md"
}

main() {
  echo ""
  echo "College Board Item Challenge — panel demo"
  echo "========================================"
  ensure_preflight
  run_api_demo
  print_summary
  if [[ "${FULL_MODE}" == "true" ]]; then
    run_full_validation
  fi
  log_section "Demo complete"
}

main "$@"
