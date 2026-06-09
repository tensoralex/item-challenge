/**
 * Force in-memory storage for unit tests (handlers import createStorage at module load).
 * DynamoDB integration tests use DynamoDBStorage directly and are not affected.
 */
process.env.USE_DYNAMODB = 'false';
