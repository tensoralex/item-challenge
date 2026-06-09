import { describe, expect, it } from 'vitest';
import { METADATA_SK, versionSk } from '../lib/keys.js';
import { toExamItem, toItemRecord } from '../lib/mappers.js';
import { ExamItem } from '../types/item.js';

const sampleItem: ExamItem = {
  id: 'test-id',
  subject: 'AP Biology',
  itemType: 'multiple-choice',
  difficulty: 3,
  content: {
    question: 'Q?',
    options: ['A', 'B'],
    correctAnswer: 'A',
    explanation: 'Because.',
  },
  metadata: {
    author: 'author',
    created: 1000,
    lastModified: 2000,
    version: 2,
    status: 'draft',
    tags: ['bio'],
  },
  securityLevel: 'standard',
};

describe('mappers', () => {
  it('adds GSI keys only on METADATA rows', () => {
    const meta = toItemRecord(sampleItem, METADATA_SK);
    expect(meta.PK).toBe('ITEM#test-id');
    expect(meta.SK).toBe('METADATA');
    expect(meta.GSI1PK).toBe('SUBJECT#AP Biology');
    expect(meta.version).toBe(2);

    const ver = toItemRecord(sampleItem, versionSk(2));
    expect(ver.SK).toBe('VERSION#000002');
    // Version snapshot rows must not carry GSI key attributes (DynamoDB forbids empty
    // strings for index key attributes; sparse indexing excludes absent-key rows).
    expect(ver.GSI1PK).toBeUndefined();
    expect(ver.GSI1SK).toBeUndefined();
  });

  it('strips internal keys from API responses', () => {
    const record = toItemRecord(sampleItem);
    const item = toExamItem(record as unknown as Record<string, unknown>);
    expect(item).not.toHaveProperty('PK');
    expect(item).not.toHaveProperty('SK');
    expect(item).not.toHaveProperty('GSI1PK');
    expect(item.id).toBe('test-id');
  });
});
