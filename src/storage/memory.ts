/**
 * In-Memory Storage — unit-test and zero-config fallback backend
 *
 * I kept this for fast unit tests and zero-config fallback (USE_DYNAMODB=false).
 * Primary development uses DynamoDB Local with single-table design (see dynamodb.ts).
 *
 * Limitations vs production storage:
 * - Not single-table; separate in-process Maps for items and versions
 * - Honors explicit expectedVersion on update (same contract as DynamoDB); no DynamoDB-style conditions
 * - Data is lost when the process restarts
 * - offset/limit pagination (not DynamoDB cursor semantics)
 */

import { randomUUID } from 'crypto';
import { ExamItem, CreateItemRequest, UpdateItemRequest, ListItemsQuery } from '../types/item.js';
import { decodeOffsetCursor, encodeOffsetCursor } from '../lib/cursor.js';
import { toItemSummary } from '../lib/mappers.js';
import { ItemStorage } from './interface.js';
import { OptimisticLockError } from './errors.js';

export class MemoryStorage implements ItemStorage {
  private items: Map<string, ExamItem> = new Map();
  private versions: Map<string, ExamItem[]> = new Map();

  async createItem(data: CreateItemRequest): Promise<ExamItem> {
    // Server-owned timestamps and version (same contract as DynamoDB storage).
    const now = Date.now();
    const item: ExamItem = {
      id: randomUUID(),
      ...data,
      metadata: {
        ...data.metadata,
        created: now,
        lastModified: now,
        version: 1,
      },
    };

    this.items.set(item.id, item);
    this.versions.set(item.id, [{ ...item }]);

    return item;
  }

  async getItem(id: string): Promise<ExamItem | null> {
    return this.items.get(id) || null;
  }

  async updateItem(
    id: string,
    data: UpdateItemRequest,
    expectedVersion?: number,
  ): Promise<ExamItem | null> {
    const item = this.items.get(id);
    if (!item) return null;

    if (expectedVersion !== undefined && item.metadata.version !== expectedVersion) {
      throw new OptimisticLockError(id);
    }

    const updated: ExamItem = {
      ...item,
      ...data,
      content: data.content ? { ...item.content, ...data.content } : item.content,
      metadata: {
        ...item.metadata,
        ...(data.metadata || {}),
        lastModified: Date.now(),
        version: item.metadata.version + 1,
      },
    };

    this.items.set(id, updated);

    // Save version history
    const history = this.versions.get(id) || [];
    history.push({ ...updated });
    this.versions.set(id, history);

    return updated;
  }

  async listItems(query: ListItemsQuery) {
    let items = Array.from(this.items.values());

    // Filter by subject
    if (query.subject) {
      items = items.filter((item) => item.subject === query.subject);
    }

    // Filter by status
    if (query.status) {
      items = items.filter((item) => item.metadata.status === query.status);
    }

    const offset = query.cursor ? decodeOffsetCursor(query.cursor) : query.offset || 0;
    const limit = query.limit || 10;
    const page = items.slice(offset, offset + limit);
    const nextOffset = offset + limit;
    const summaries = page.map((item) => toItemSummary(item));

    return {
      items: summaries,
      count: summaries.length,
      ...(nextOffset < items.length && { nextCursor: encodeOffsetCursor(nextOffset) }),
    };
  }

  async createVersion(id: string): Promise<ExamItem | null> {
    const item = this.items.get(id);
    if (!item) return null;

    // Create a new version (copy of current state)
    const newVersion: ExamItem = {
      ...item,
      metadata: {
        ...item.metadata,
        version: item.metadata.version + 1,
        lastModified: Date.now(),
      },
    };

    this.items.set(id, newVersion);

    const history = this.versions.get(id) || [];
    history.push({ ...newVersion });
    this.versions.set(id, history);

    return newVersion;
  }

  async getAuditTrail(id: string): Promise<ExamItem[]> {
    return this.versions.get(id) || [];
  }
}
