/**
 * Deterministic optimistic-lock tests (in-memory reference storage).
 * No DynamoDB required — same expectedVersion contract as DynamoDBStorage.
 */

import { describe, expect, it } from 'vitest';
import { OptimisticLockError } from '../storage/errors.js';
import { MemoryStorage } from '../storage/memory.js';

const sampleCreate = {
  subject: 'AP Biology',
  itemType: 'multiple-choice' as const,
  difficulty: 3,
  content: {
    question: 'Q?',
    options: ['A', 'B'],
    correctAnswer: 'A',
    explanation: 'Because.',
  },
  metadata: {
    author: 'test',
    status: 'draft' as const,
    tags: [],
  },
  securityLevel: 'standard' as const,
};

describe('optimistic locking (memory)', () => {
  it('throws OptimisticLockError when expectedVersion is stale', async () => {
    const storage = new MemoryStorage();
    const created = await storage.createItem(sampleCreate);

    await storage.updateItem(created.id, { difficulty: 4 });

    await expect(storage.updateItem(created.id, { difficulty: 5 }, 1)).rejects.toThrow(
      OptimisticLockError,
    );
  });

  it('succeeds when expectedVersion matches current', async () => {
    const storage = new MemoryStorage();
    const created = await storage.createItem(sampleCreate);

    const updated = await storage.updateItem(created.id, { difficulty: 4 }, 1);
    expect(updated?.metadata.version).toBe(2);
  });
});
