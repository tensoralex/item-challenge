/**
 * E2E harness setup — use DynamoDB Local (not in-memory unit-test default).
 */
process.env.DYNAMODB_ENDPOINT ||= 'http://localhost:8000';
process.env.DYNAMODB_TABLE_NAME ||= 'ExamItems';
process.env.USE_DYNAMODB = 'true';
