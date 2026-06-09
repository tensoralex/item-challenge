#!/usr/bin/env bash
# College Board Item Management Exercise — provision local DynamoDB table.
#
# Creates the ExamItems single-table design (PK/SK + GSI1) used by the
# exam item management API. Idempotent: skips creation if the table exists
# with the expected GSI1 INCLUDE projection. Auto-recreates on schema drift.
# Pass --reset to delete and recreate the table (clean slate).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

RESET=0
for arg in "$@"; do
  if [[ "$arg" == "--reset" ]]; then
    RESET=1
  fi
done

ENDPOINT="${DYNAMODB_ENDPOINT:-http://localhost:8000}"
TABLE="${DYNAMODB_TABLE_NAME:-ExamItems}"
export AWS_REGION="${AWS_REGION:-us-east-1}"
export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-local}"
export AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-local}"

GSI_DEFINITION='[{"IndexName":"GSI1","KeySchema":[{"AttributeName":"GSI1PK","KeyType":"HASH"},{"AttributeName":"GSI1SK","KeyType":"RANGE"}],"Projection":{"ProjectionType":"INCLUDE","NonKeyAttributes":["id","subject","itemType","difficulty","securityLevel","metadata"]}}]'

table_exists() {
  aws dynamodb describe-table --table-name "${TABLE}" --endpoint-url "${ENDPOINT}" >/dev/null 2>&1
}

gsi_projection_ok() {
  local proj
  proj="$(aws dynamodb describe-table \
    --table-name "${TABLE}" \
    --endpoint-url "${ENDPOINT}" \
    --query 'Table.GlobalSecondaryIndexes[?IndexName==`GSI1`].Projection.ProjectionType | [0]' \
    --output text 2>/dev/null || echo "")"
  [[ "${proj}" == "INCLUDE" ]]
}

delete_table_if_present() {
  if table_exists; then
    log_info "Deleting table '${TABLE}'..."
    aws dynamodb delete-table --table-name "${TABLE}" --endpoint-url "${ENDPOINT}" >/dev/null
    aws dynamodb wait table-not-exists --table-name "${TABLE}" --endpoint-url "${ENDPOINT}" 2>/dev/null || sleep 2
    log_ok "Table '${TABLE}' deleted."
  fi
}

create_table() {
  log_info "Creating single-table schema (PK/SK + GSI1 INCLUDE)..."
  aws dynamodb create-table \
    --table-name "${TABLE}" \
    --endpoint-url "${ENDPOINT}" \
    --billing-mode PAY_PER_REQUEST \
    --attribute-definitions \
        AttributeName=PK,AttributeType=S \
        AttributeName=SK,AttributeType=S \
        AttributeName=GSI1PK,AttributeType=S \
        AttributeName=GSI1SK,AttributeType=S \
    --key-schema \
        AttributeName=PK,KeyType=HASH \
        AttributeName=SK,KeyType=RANGE \
    --global-secondary-indexes "${GSI_DEFINITION}"
  log_ok "Table '${TABLE}' created."
}

log_section "Creating DynamoDB table '${TABLE}' at ${ENDPOINT}"

# Wait for DynamoDB Local (up to 30 seconds)
for _ in $(seq 1 30); do
  if dynamodb_local_ready; then
    break
  fi
  log_info "Waiting for DynamoDB Local..."
  sleep 1
done

if ! dynamodb_local_ready; then
  log_error "DynamoDB Local is not reachable at ${ENDPOINT}. Run 04_start_dynamodb_local.sh first."
  exit 1
fi

if [[ "${RESET}" -eq 1 ]]; then
  delete_table_if_present
  create_table
  exit 0
fi

if table_exists; then
  if gsi_projection_ok; then
    log_ok "Table '${TABLE}' already exists with expected GSI1 INCLUDE projection."
    exit 0
  fi
  log_warn "Table '${TABLE}' exists but GSI1 projection is outdated — recreating..."
  delete_table_if_present
fi

create_table
