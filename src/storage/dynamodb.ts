/**
 * DynamoDB single-table storage for exam items.
 *
 * Table design (ExamItems):
 *   PK = ITEM#<id>, SK = METADATA     — current item state
 *   PK = ITEM#<id>, SK = VERSION#nnnnnn — immutable version snapshots (audit trail)
 *   GSI1: GSI1PK = SUBJECT#<subject>, GSI1SK = <status>#<created> (METADATA rows only)
 *
 * Writes use TransactWriteItems so METADATA and VERSION rows stay consistent.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  ScanCommand,
  QueryCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { ExamItem, CreateItemRequest, UpdateItemRequest, ListItemsQuery } from '../types/item.js';
import { ItemStorage } from './interface.js';
import { METADATA_SK, VERSION_PREFIX, gsi1Pk, itemPk, versionSk } from '../lib/keys.js';
import { decodeDynamoCursor, encodeDynamoCursor } from '../lib/cursor.js';
import { toExamItem, toItemRecord, toItemSummary } from '../lib/mappers.js';
import { OptimisticLockError } from './errors.js';

/** True when a TransactWriteItems cancel was caused by a version conditional check failure. */
function isOptimisticLockCancellation(err: unknown): boolean {
  if (
    !err ||
    typeof err !== 'object' ||
    (err as { name?: string }).name !== 'TransactionCanceledException'
  ) {
    return false;
  }
  const reasons = (err as { CancellationReasons?: Array<{ Code?: string }> }).CancellationReasons;
  if (!Array.isArray(reasons)) return false;
  return reasons.some((reason) => reason.Code === 'ConditionalCheckFailed');
}

export { OptimisticLockError };

export class DynamoDBStorage implements ItemStorage {
  private client: DynamoDBDocumentClient;
  private tableName: string;

  constructor() {
    const isLocal = !!process.env.DYNAMODB_ENDPOINT;

    const dynamoClient = new DynamoDBClient({
      region: process.env.AWS_REGION || 'us-east-1',
      ...(isLocal && {
        endpoint: process.env.DYNAMODB_ENDPOINT,
        // DynamoDB Local ignores credentials; provide dummies so the SDK's
        // credential chain does not fail when no AWS profile is configured.
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'local',
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'local',
        },
      }),
    });

    this.client = DynamoDBDocumentClient.from(dynamoClient);
    this.tableName = process.env.DYNAMODB_TABLE_NAME || 'ExamItems';
  }

  async createItem(data: CreateItemRequest): Promise<ExamItem> {
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

    const metadataRecord = toItemRecord(item, METADATA_SK);
    const versionRecord = toItemRecord(item, versionSk(1));

    // Atomic: current state + first audit snapshot must both succeed or neither.
    await this.client.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: this.tableName,
              Item: metadataRecord,
              ConditionExpression: 'attribute_not_exists(SK)',
            },
          },
          {
            Put: {
              TableName: this.tableName,
              Item: versionRecord,
              ConditionExpression: 'attribute_not_exists(SK)',
            },
          },
        ],
      }),
    );

    return item;
  }

  async getItem(id: string): Promise<ExamItem | null> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: itemPk(id), SK: METADATA_SK },
      }),
    );

    if (!result.Item) return null;
    return toExamItem(result.Item as Record<string, unknown>);
  }

  async updateItem(
    id: string,
    data: UpdateItemRequest,
    expectedVersion?: number,
  ): Promise<ExamItem | null> {
    const existing = await this.getItem(id);
    if (!existing) return null;

    // Caller may supply the version they believe is current (HTTP: If-Match header on PUT).
    const expected = expectedVersion ?? existing.metadata.version;
    const newVersion = existing.metadata.version + 1;
    const updated: ExamItem = {
      ...existing,
      ...data,
      content: data.content ? { ...existing.content, ...data.content } : existing.content,
      metadata: {
        ...existing.metadata,
        ...(data.metadata || {}),
        lastModified: Date.now(),
        version: newVersion,
      },
    };

    const metadataRecord = toItemRecord(updated, METADATA_SK);
    const snapshotRecord = toItemRecord(updated, versionSk(newVersion));

    try {
      await this.client.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: this.tableName,
                Item: metadataRecord,
                // Optimistic lock: reject if stored version != caller's expected version.
                ConditionExpression: 'version = :expected',
                ExpressionAttributeValues: { ':expected': expected },
              },
            },
            {
              Put: {
                TableName: this.tableName,
                Item: snapshotRecord,
                ConditionExpression: 'attribute_not_exists(SK)',
              },
            },
          ],
        }),
      );
    } catch (err: unknown) {
      if (isOptimisticLockCancellation(err)) {
        throw new OptimisticLockError(id);
      }
      throw err;
    }

    return updated;
  }

  async listItems(query: ListItemsQuery) {
    const limit = query.limit || 10;

    // Prefer GSI1 query when filtering by subject (avoids full table Scan).
    if (query.subject) {
      const keyCondition = 'GSI1PK = :pk';
      const values: Record<string, unknown> = { ':pk': gsi1Pk(query.subject) };
      let filterExpression: string | undefined;

      if (query.status) {
        filterExpression = 'begins_with(GSI1SK, :statusPrefix)';
        values[':statusPrefix'] = `${query.status}#`;
      }

      let exclusiveStartKey: Record<string, unknown> | undefined;
      if (query.cursor) {
        exclusiveStartKey = decodeDynamoCursor(query.cursor);
      }

      // Note: Limit is applied before FilterExpression — status-filtered pages may be short.
      const result = await this.client.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: 'GSI1',
          KeyConditionExpression: keyCondition,
          ...(filterExpression && { FilterExpression: filterExpression }),
          ExpressionAttributeValues: values,
          Limit: limit,
          ...(exclusiveStartKey && { ExclusiveStartKey: exclusiveStartKey }),
        }),
      );

      const items = (result.Items || []).map((row) =>
        toItemSummary(row as Record<string, unknown>),
      );
      return {
        items,
        count: items.length,
        ...(result.LastEvaluatedKey && {
          nextCursor: encodeDynamoCursor(result.LastEvaluatedKey as Record<string, unknown>),
        }),
      };
    }

    // No subject filter: Scan METADATA rows only (acceptable for small local datasets).
    // The API requires subject via listItemsQuerySchema — this branch is for direct storage use.
    // Production would use a sparse GSI2 — see ARCHITECTURE.md.
    const result = await this.client.send(
      new ScanCommand({
        TableName: this.tableName,
        FilterExpression: 'SK = :meta',
        ExpressionAttributeValues: { ':meta': METADATA_SK },
        Limit: limit,
      }),
    );

    const items = (result.Items || []).map((row) => toItemSummary(row as Record<string, unknown>));
    return { items, count: items.length };
  }

  async createVersion(id: string): Promise<ExamItem | null> {
    const existing = await this.getItem(id);
    if (!existing) return null;

    const newVersion = existing.metadata.version + 1;
    const versioned: ExamItem = {
      ...existing,
      metadata: {
        ...existing.metadata,
        version: newVersion,
        lastModified: Date.now(),
      },
    };

    const metadataRecord = toItemRecord(versioned, METADATA_SK);
    const snapshotRecord = toItemRecord(versioned, versionSk(newVersion));

    try {
      await this.client.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: this.tableName,
                Item: metadataRecord,
                ConditionExpression: 'version = :expected',
                ExpressionAttributeValues: { ':expected': existing.metadata.version },
              },
            },
            {
              Put: {
                TableName: this.tableName,
                Item: snapshotRecord,
                ConditionExpression: 'attribute_not_exists(SK)',
              },
            },
          ],
        }),
      );
    } catch (err: unknown) {
      if (isOptimisticLockCancellation(err)) {
        throw new OptimisticLockError(id);
      }
      throw err;
    }

    return versioned;
  }

  async getAuditTrail(id: string): Promise<ExamItem[]> {
    const versions: ExamItem[] = [];
    let exclusiveStartKey: Record<string, unknown> | undefined;

    // Audit must return complete version history — paginate until LastEvaluatedKey is exhausted
    // (a single Query response is capped at 1 MB).
    do {
      const result = await this.client.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
          ExpressionAttributeValues: {
            ':pk': itemPk(id),
            ':prefix': VERSION_PREFIX,
          },
          ScanIndexForward: true,
          ...(exclusiveStartKey && { ExclusiveStartKey: exclusiveStartKey }),
        }),
      );

      for (const row of result.Items ?? []) {
        versions.push(toExamItem(row as Record<string, unknown>));
      }
      exclusiveStartKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (exclusiveStartKey);

    return versions;
  }
}
