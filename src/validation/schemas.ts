/**
 * Request validation for exam item API inputs.
 *
 * Server-owned fields (id, created, lastModified, version) are rejected via
 * .strict() so clients cannot forge audit metadata or version numbers.
 */

import { z } from 'zod';

/** Allowed values per GLOSSARY.md */
export const itemTypeSchema = z.enum(['multiple-choice', 'free-response', 'essay']);
export const statusSchema = z.enum(['draft', 'review', 'approved', 'archived']);
export const securityLevelSchema = z.enum(['standard', 'secure', 'highly-secure']);

/** Item ids are server-generated UUIDs. */
export const itemIdSchema = z.string().uuid();

/** Well-known uuid for tests/demos — valid format, guaranteed absent. */
export const ABSENT_ITEM_ID = '00000000-0000-4000-8000-000000000000';

/** Bounds to keep items well under DynamoDB's 400 KB item limit. */
const MAX_SUBJECT_LEN = 200;
const MAX_AUTHOR_LEN = 200;
const MAX_QUESTION_LEN = 10_000;
const MAX_EXPLANATION_LEN = 10_000;
const MAX_ANSWER_LEN = 1_000;
const MAX_OPTION_LEN = 1_000;
const MAX_OPTIONS = 10;
const MAX_TAGS = 20;
const MAX_TAG_LEN = 50;

const contentSchema = z
  .object({
    question: z.string().min(1).max(MAX_QUESTION_LEN),
    options: z.array(z.string().min(1).max(MAX_OPTION_LEN)).max(MAX_OPTIONS).optional(),
    correctAnswer: z.string().min(1).max(MAX_ANSWER_LEN),
    explanation: z.string().min(1).max(MAX_EXPLANATION_LEN),
  })
  .strict();

/**
 * Metadata on create — only client-writable fields; no timestamps or version.
 */
const createMetadataSchema = z
  .object({
    author: z.string().min(1).max(MAX_AUTHOR_LEN),
    status: statusSchema,
    tags: z.array(z.string().min(1).max(MAX_TAG_LEN)).max(MAX_TAGS),
  })
  .strict();

export const createItemSchema = z
  .object({
    subject: z.string().min(1).max(MAX_SUBJECT_LEN),
    itemType: itemTypeSchema,
    difficulty: z.number().int().min(1).max(5),
    content: contentSchema,
    metadata: createMetadataSchema,
    securityLevel: securityLevelSchema,
  })
  .strict()
  .superRefine((data, ctx) => {
    if (
      data.itemType === 'multiple-choice' &&
      (!data.content.options || data.content.options.length < 2)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'multiple-choice items require at least two options',
        path: ['content', 'options'],
      });
    }
  });

/**
 * Partial update — server still owns created/lastModified/version on apply.
 */
const updateMetadataSchema = z
  .object({
    author: z.string().min(1).max(MAX_AUTHOR_LEN).optional(),
    status: statusSchema.optional(),
    tags: z.array(z.string().min(1).max(MAX_TAG_LEN)).max(MAX_TAGS).optional(),
  })
  .strict();

export const updateItemSchema = z
  .object({
    subject: z.string().min(1).max(MAX_SUBJECT_LEN).optional(),
    itemType: itemTypeSchema.optional(),
    difficulty: z.number().int().min(1).max(5).optional(),
    content: contentSchema.partial().optional(),
    metadata: updateMetadataSchema.optional(),
    securityLevel: securityLevelSchema.optional(),
  })
  .strict()
  .refine((obj) => Object.keys(obj).length > 0, {
    message: 'At least one field required',
  });

/**
 * List query — subject is required (GSI1 access pattern).
 * Unfiltered listing requires a different index; see ARCHITECTURE.md roadmap.
 */
export const listItemsQuerySchema = z.object({
  subject: z.string().min(1).max(MAX_SUBJECT_LEN),
  status: statusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  cursor: z.string().min(1).optional(),
});

export type CreateItemInput = z.infer<typeof createItemSchema>;
export type UpdateItemInput = z.infer<typeof updateItemSchema>;
export type ListItemsQueryInput = z.infer<typeof listItemsQuerySchema>;
