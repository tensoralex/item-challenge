import { describe, expect, it } from 'vitest';
import { createItemSchema, listItemsQuerySchema, updateItemSchema } from '../validation/schemas.js';

const validCreate = {
  subject: 'AP Biology',
  itemType: 'multiple-choice',
  difficulty: 3,
  content: {
    question: 'What is photosynthesis?',
    options: ['A', 'B'],
    correctAnswer: 'A',
    explanation: 'Because.',
  },
  metadata: {
    author: 'test-author',
    status: 'draft',
    tags: ['biology'],
  },
  securityLevel: 'standard',
};

describe('createItemSchema', () => {
  it('accepts valid create payloads', () => {
    expect(createItemSchema.parse(validCreate)).toEqual(validCreate);
  });

  it('rejects server-owned metadata fields', () => {
    expect(() =>
      createItemSchema.parse({
        ...validCreate,
        metadata: { ...validCreate.metadata, version: 99 },
      }),
    ).toThrow();

    expect(() =>
      createItemSchema.parse({
        ...validCreate,
        id: 'forged-id',
      }),
    ).toThrow();
  });

  it('rejects invalid difficulty', () => {
    expect(() => createItemSchema.parse({ ...validCreate, difficulty: 6 })).toThrow();
  });
});

describe('updateItemSchema', () => {
  it('rejects forged version in metadata', () => {
    expect(() =>
      updateItemSchema.parse({
        metadata: { version: 5 },
      }),
    ).toThrow();
  });

  it('rejects empty update body', () => {
    expect(() => updateItemSchema.parse({})).toThrow(/At least one field required/);
  });
});

describe('createItemSchema edge cases', () => {
  it('rejects multiple-choice with fewer than two options', () => {
    expect(() =>
      createItemSchema.parse({
        ...validCreate,
        content: {
          question: 'Pick one?',
          options: ['A'],
          correctAnswer: 'A',
          explanation: 'Because.',
        },
      }),
    ).toThrow(/multiple-choice items require at least two options/);
  });

  it('rejects multiple-choice without options', () => {
    expect(() =>
      createItemSchema.parse({
        ...validCreate,
        content: {
          question: 'Pick one?',
          correctAnswer: 'A',
          explanation: 'Because.',
        },
      }),
    ).toThrow(/multiple-choice items require at least two options/);
  });

  it('rejects over-max subject length', () => {
    expect(() =>
      createItemSchema.parse({
        ...validCreate,
        subject: 'x'.repeat(201),
      }),
    ).toThrow();
  });
});

describe('listItemsQuerySchema', () => {
  it('requires subject', () => {
    expect(() => listItemsQuerySchema.parse({})).toThrow();
  });

  it('coerces limit from string and caps at 50', () => {
    const parsed = listItemsQuerySchema.parse({ subject: 'AP Biology', limit: '25' });
    expect(parsed.limit).toBe(25);
    expect(() => listItemsQuerySchema.parse({ subject: 'AP Biology', limit: '51' })).toThrow();
  });

  it('defaults limit to 10', () => {
    const parsed = listItemsQuerySchema.parse({ subject: 'AP Biology' });
    expect(parsed.limit).toBe(10);
  });
});
