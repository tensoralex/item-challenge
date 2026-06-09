/**
 * Storage Interface — contract for all storage backends.
 *
 * Implementations:
 *   - DynamoDBStorage (dynamodb.ts) — primary; single-table design
 *   - MemoryStorage (memory.ts) — unit tests / USE_DYNAMODB=false
 *
 * All mutating writes must bump version and append an audit snapshot.
 */

import {
  ExamItem,
  CreateItemRequest,
  UpdateItemRequest,
  ListItemsQuery,
  ListItemsResult,
} from '../types/item.js';

export interface ItemStorage {
  createItem(data: CreateItemRequest): Promise<ExamItem>;
  getItem(id: string): Promise<ExamItem | null>;
  /**
   * @param expectedVersion When provided, write fails with OptimisticLockError if the
   *   stored version does not match (supports If-Match-style concurrency control).
   */
  updateItem(
    id: string,
    data: UpdateItemRequest,
    expectedVersion?: number,
  ): Promise<ExamItem | null>;
  listItems(query: ListItemsQuery): Promise<ListItemsResult>;
  createVersion(id: string): Promise<ExamItem | null>;
  getAuditTrail(id: string): Promise<ExamItem[]>;
}
