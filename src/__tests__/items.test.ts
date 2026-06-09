/**
 * Handler tests for core CRUD + audit endpoints (memory-backed).
 */

import { describe, expect, it } from 'vitest';
import {
  createItemHandler,
  createVersionHandler,
  getItemHandler,
  updateItemHandler,
  getAuditTrailHandler,
  listItemsHandler,
} from '../handlers/items.js';
import { ABSENT_ITEM_ID } from '../validation/schemas.js';

const validCreate = {
  subject: 'AP Biology',
  itemType: 'multiple-choice' as const,
  difficulty: 3,
  content: {
    question: 'What is photosynthesis?',
    options: ['A', 'B', 'C', 'D'],
    correctAnswer: 'A',
    explanation: 'Photosynthesis is the process...',
  },
  metadata: {
    author: 'test-author',
    status: 'draft' as const,
    tags: ['biology'],
  },
  securityLevel: 'standard' as const,
};

describe('Item handlers', () => {
  describe('createItemHandler', () => {
    it('returns 201 with server-owned version', async () => {
      const result = await createItemHandler(validCreate);

      expect(result.statusCode).toBe(201);
      expect(result.body).toHaveProperty('id');
      if ('metadata' in result.body) {
        expect(result.body.metadata).toHaveProperty('version', 1);
        expect(result.body.metadata).toHaveProperty('created');
        expect(result.body.metadata).toHaveProperty('lastModified');
      }
    });

    it('returns 400 for forged server-owned fields', async () => {
      const result = await createItemHandler({
        ...validCreate,
        id: 'forged-id',
      });

      expect(result.statusCode).toBe(400);
      expect(result.body).toHaveProperty('error', 'Validation failed');
    });

    it('returns 400 for invalid body', async () => {
      const result = await createItemHandler({ subject: 'only-subject' });

      expect(result.statusCode).toBe(400);
      expect(result.body).toHaveProperty('error', 'Validation failed');
    });
  });

  describe('getItemHandler', () => {
    it('returns 400 for empty id', async () => {
      const result = await getItemHandler('');

      expect(result.statusCode).toBe(400);
      expect(result.body).toHaveProperty('error', 'Missing item id');
    });

    it('returns 400 for malformed id', async () => {
      const result = await getItemHandler('not-a-uuid');

      expect(result.statusCode).toBe(400);
      expect(result.body).toHaveProperty('error', 'Invalid item id');
    });

    it('returns 404 for non-existent item', async () => {
      const result = await getItemHandler(ABSENT_ITEM_ID);

      expect(result.statusCode).toBe(404);
      expect(result.body).toHaveProperty('error', 'Item not found');
    });

    it('returns 200 for existing item', async () => {
      const created = await createItemHandler(validCreate);
      if (!('id' in created.body)) throw new Error('create failed');

      const result = await getItemHandler(created.body.id as string);

      expect(result.statusCode).toBe(200);
      expect(result.body).toHaveProperty('id', created.body.id);
      if ('subject' in result.body) {
        expect(result.body.subject).toBe('AP Biology');
      }
    });
  });

  describe('listItemsHandler', () => {
    it('returns 400 when subject is missing', async () => {
      const result = await listItemsHandler({});

      expect(result.statusCode).toBe(400);
      expect(result.body).toHaveProperty('error', 'Validation failed');
    });

    it('returns summaries without content', async () => {
      await createItemHandler(validCreate);
      const result = await listItemsHandler({ subject: 'AP Biology' });

      expect(result.statusCode).toBe(200);
      if ('items' in result.body && Array.isArray(result.body.items)) {
        expect(result.body.items.length).toBeGreaterThanOrEqual(1);
        expect(result.body.items[0]).not.toHaveProperty('content');
      }
    });

    it('filters by status', async () => {
      await createItemHandler(validCreate);
      const result = await listItemsHandler({ subject: 'AP Biology', status: 'draft' });

      expect(result.statusCode).toBe(200);
      if ('items' in result.body && Array.isArray(result.body.items)) {
        expect(result.body.items.length).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe('updateItemHandler', () => {
    it('returns 400 for empty id', async () => {
      const result = await updateItemHandler('', { difficulty: 2 });

      expect(result.statusCode).toBe(400);
      expect(result.body).toHaveProperty('error', 'Missing item id');
    });

    it('returns 400 for malformed id', async () => {
      const result = await updateItemHandler('bad-id', { difficulty: 2 });

      expect(result.statusCode).toBe(400);
      expect(result.body).toHaveProperty('error', 'Invalid item id');
    });

    it('returns 400 for empty update body', async () => {
      const created = await createItemHandler(validCreate);
      if (!('id' in created.body)) throw new Error('create failed');

      const result = await updateItemHandler(created.body.id as string, {});

      expect(result.statusCode).toBe(400);
      expect(result.body).toHaveProperty('error', 'Validation failed');
    });

    it('returns 200 and bumps version', async () => {
      const created = await createItemHandler(validCreate);
      if (!('id' in created.body)) throw new Error('create failed');

      const result = await updateItemHandler(created.body.id as string, {
        metadata: { status: 'review' },
      });

      expect(result.statusCode).toBe(200);
      if ('metadata' in result.body) {
        expect(result.body.metadata).toHaveProperty('version', 2);
        expect(result.body.metadata).toHaveProperty('status', 'review');
      }
    });

    it('returns 404 for unknown id', async () => {
      const result = await updateItemHandler(ABSENT_ITEM_ID, { difficulty: 2 });

      expect(result.statusCode).toBe(404);
    });

    it('returns 400 for invalid update body', async () => {
      const created = await createItemHandler(validCreate);
      if (!('id' in created.body)) throw new Error('create failed');

      const result = await updateItemHandler(created.body.id as string, {
        metadata: { version: 99 },
      });

      expect(result.statusCode).toBe(400);
    });

    it('returns 409 when expectedVersion is stale', async () => {
      const created = await createItemHandler(validCreate);
      if (!('id' in created.body)) throw new Error('create failed');
      const id = created.body.id as string;

      await updateItemHandler(id, { difficulty: 4 });

      const result = await updateItemHandler(id, { difficulty: 5 }, 1);

      expect(result.statusCode).toBe(409);
      expect(result.body).toHaveProperty('error');
    });
  });

  describe('createVersionHandler', () => {
    it('returns 400 for malformed id', async () => {
      const result = await createVersionHandler('not-uuid');

      expect(result.statusCode).toBe(400);
      expect(result.body).toHaveProperty('error', 'Invalid item id');
    });

    it('returns 404 for unknown item', async () => {
      const result = await createVersionHandler(ABSENT_ITEM_ID);

      expect(result.statusCode).toBe(404);
    });

    it('returns 201 and bumps version without content change', async () => {
      const created = await createItemHandler(validCreate);
      if (!('id' in created.body)) throw new Error('create failed');
      const id = created.body.id as string;

      const result = await createVersionHandler(id);

      expect(result.statusCode).toBe(201);
      if ('metadata' in result.body) {
        expect(result.body.metadata).toHaveProperty('version', 2);
      }

      const audit = await getAuditTrailHandler(id);
      if ('total' in audit.body) {
        expect(audit.body.total).toBe(2);
      }
    });
  });

  describe('getAuditTrailHandler', () => {
    it('returns 400 for empty id', async () => {
      const result = await getAuditTrailHandler('');

      expect(result.statusCode).toBe(400);
      expect(result.body).toHaveProperty('error', 'Missing item id');
    });

    it('returns 400 for malformed id', async () => {
      const result = await getAuditTrailHandler('bad-id');

      expect(result.statusCode).toBe(400);
      expect(result.body).toHaveProperty('error', 'Invalid item id');
    });

    it('returns 404 for unknown item', async () => {
      const result = await getAuditTrailHandler(ABSENT_ITEM_ID);

      expect(result.statusCode).toBe(404);
    });

    it('returns ordered version snapshots', async () => {
      const created = await createItemHandler(validCreate);
      if (!('id' in created.body)) throw new Error('create failed');
      const id = created.body.id as string;

      await updateItemHandler(id, { difficulty: 4 });

      const result = await getAuditTrailHandler(id);

      expect(result.statusCode).toBe(200);
      expect(result.body).toHaveProperty('total', 2);
      if ('versions' in result.body && Array.isArray(result.body.versions)) {
        const versions = result.body.versions as Array<{ metadata: { version: number } }>;
        expect(versions[0].metadata.version).toBe(1);
        expect(versions[1].metadata.version).toBe(2);
      }
    });
  });
});
