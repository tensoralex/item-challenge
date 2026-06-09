/**
 * Integration tests against DynamoDB Local (single-table schema).
 * Skipped automatically when the endpoint is unreachable.
 */

import { DynamoDBClient, ListTablesCommand } from '@aws-sdk/client-dynamodb';
import { beforeAll, describe, expect, it } from 'vitest';
import { DynamoDBStorage, OptimisticLockError } from './dynamodb.js';

const ENDPOINT = process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000';
const TABLE = process.env.DYNAMODB_TABLE_NAME || 'ExamItems';

const sampleCreate = {
  subject: 'AP Calculus',
  itemType: 'free-response' as const,
  difficulty: 4,
  content: {
    question: 'Integrate x dx',
    correctAnswer: 'x^2/2 + C',
    explanation: 'Power rule.',
  },
  metadata: {
    author: 'integration-test',
    status: 'draft' as const,
    tags: ['calc'],
  },
  securityLevel: 'standard' as const,
};

async function isDynamoDbLocalReady(): Promise<boolean> {
  try {
    const client = new DynamoDBClient({
      region: 'us-east-1',
      endpoint: ENDPOINT,
      credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
    });
    await client.send(new ListTablesCommand({}));
    return true;
  } catch {
    return false;
  }
}

describe('DynamoDBStorage integration', () => {
  let storage: DynamoDBStorage;
  let skip = true;

  beforeAll(async () => {
    skip = !(await isDynamoDbLocalReady());
    if (skip) return;

    process.env.DYNAMODB_ENDPOINT = ENDPOINT;
    process.env.DYNAMODB_TABLE_NAME = TABLE;
    storage = new DynamoDBStorage();
  });

  it('create, get, update, and audit trail', async (ctx) => {
    if (skip) ctx.skip();

    const created = await storage.createItem(sampleCreate);
    expect(created.metadata.version).toBe(1);

    const fetched = await storage.getItem(created.id);
    expect(fetched?.subject).toBe('AP Calculus');
    expect(fetched).not.toHaveProperty('PK');

    const updated = await storage.updateItem(created.id, {
      metadata: { status: 'review' },
    });
    expect(updated?.metadata.version).toBe(2);
    expect(updated?.metadata.status).toBe('review');

    const audit = await storage.getAuditTrail(created.id);
    expect(audit.length).toBeGreaterThanOrEqual(2);
    expect(audit[0].metadata.version).toBe(1);
  });

  it('throws OptimisticLockError when expectedVersion is stale', async (ctx) => {
    if (skip) ctx.skip();

    const created = await storage.createItem({
      ...sampleCreate,
      subject: `AP Test ${Date.now()}`,
    });

    // Bump to version 2.
    await storage.updateItem(created.id, { difficulty: 2 });

    // Caller still believes version is 1 — deterministic conflict (no race timing).
    await expect(storage.updateItem(created.id, { difficulty: 3 }, 1)).rejects.toThrow(
      OptimisticLockError,
    );
  });

  it('lists items by subject as summaries and creates version checkpoint', async (ctx) => {
    if (skip) ctx.skip();

    const listSubject = `AP List ${Date.now()}`;
    const created = await storage.createItem({
      ...sampleCreate,
      subject: listSubject,
    });

    const listed = await storage.listItems({ subject: listSubject });
    expect(listed.count).toBeGreaterThanOrEqual(1);
    expect(listed.items[0]).not.toHaveProperty('content');
    expect(listed.items.some((i) => i.id === created.id)).toBe(true);

    const versioned = await storage.createVersion(created.id);
    expect(versioned?.metadata.version).toBe(2);

    const audit = await storage.getAuditTrail(created.id);
    expect(audit.length).toBe(2);
  });
});
