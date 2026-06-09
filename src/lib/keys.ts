/**
 * DynamoDB single-table key encoding for exam items.
 *
 * All item-scoped records share PK = ITEM#<id>. Sort key distinguishes
 * the current record (METADATA) from immutable version snapshots (VERSION#...).
 * GSI1 supports list-by-subject access patterns.
 */

/** Prefix for the partition key of all records belonging to one exam item. */
export const ITEM_PK_PREFIX = 'ITEM#';

/** Sort key for the current (mutable) item state. */
export const METADATA_SK = 'METADATA';

/** Prefix for immutable version snapshot sort keys. */
export const VERSION_PREFIX = 'VERSION#';

/** Number of digits for zero-padded version sort keys (lexicographic order). */
export const VERSION_PAD_WIDTH = 6;

/**
 * Partition key for an exam item and all of its version rows.
 */
export function itemPk(id: string): string {
  return `${ITEM_PK_PREFIX}${id}`;
}

/**
 * Sort key for an immutable version snapshot.
 * Zero-padding ensures VERSION#000010 sorts after VERSION#000009.
 */
export function versionSk(version: number): string {
  return `${VERSION_PREFIX}${String(version).padStart(VERSION_PAD_WIDTH, '0')}`;
}

/**
 * GSI1 partition key — list items by subject.
 */
export function gsi1Pk(subject: string): string {
  return `SUBJECT#${subject}`;
}

/**
 * GSI1 sort key — filter/sort by status and creation time within a subject.
 */
export function gsi1Sk(status: string, created: number): string {
  return `${status}#${created}`;
}

/**
 * Extract the bare item id from a partition key (ITEM#<uuid>).
 */
export function parseItemId(pk: string): string {
  return pk.startsWith(ITEM_PK_PREFIX) ? pk.slice(ITEM_PK_PREFIX.length) : pk;
}
