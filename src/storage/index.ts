/**
 * Storage Factory
 *
 * Defaults to DynamoDB (local or AWS) so development matches production access patterns.
 * Set USE_DYNAMODB=false to use the in-memory backend (unit tests / zero-config).
 */

import { ItemStorage } from './interface.js';
import { MemoryStorage } from './memory.js';
import { DynamoDBStorage } from './dynamodb.js';

export function createStorage(): ItemStorage {
  if (process.env.USE_DYNAMODB === 'false') {
    console.log('📦 Using in-memory storage (unit tests / local fallback)');
    return new MemoryStorage();
  }

  console.log('📦 Using DynamoDB storage');
  return new DynamoDBStorage();
}

export * from './interface.js';
