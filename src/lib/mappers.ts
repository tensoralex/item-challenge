/**
 * Map between domain ExamItem objects and DynamoDB single-table records.
 *
 * Internal keys (PK, SK, GSI1*) must never be returned by the public API.
 */

import { ExamItem, ExamItemSummary } from '../types/item.js';
import { METADATA_SK, gsi1Pk, gsi1Sk, itemPk } from './keys.js';

/** DynamoDB attributes not exposed on the ExamItem API type. */
const INTERNAL_KEYS = ['PK', 'SK', 'GSI1PK', 'GSI1SK', 'version'] as const;

/**
 * Full DynamoDB row shape for a metadata or version record.
 * Top-level `version` duplicates metadata.version for optimistic-lock conditions.
 */
export interface ItemRecord extends ExamItem {
  PK: string;
  SK: string;
  /**
   * GSI1 keys are present only on METADATA rows.
   * Version snapshot rows omit them so DynamoDB's sparse indexing naturally
   * excludes snapshots from GSI1. DynamoDB forbids empty strings on index key
   * attributes, so these must be absent rather than blank on snapshot rows.
   */
  GSI1PK?: string;
  GSI1SK?: string;
  /** Duplicated at top level so ConditionExpression can target version without nested paths. */
  version: number;
}

/**
 * Build a DynamoDB record from a domain item.
 * GSI attributes are only written on METADATA rows so list-by-subject does not
 * return duplicate version snapshot rows from GSI1.
 */
export function toItemRecord(item: ExamItem, sk: string = METADATA_SK): ItemRecord {
  const base: ItemRecord = {
    ...item,
    PK: itemPk(item.id),
    SK: sk,
    version: item.metadata.version,
  };

  // Only METADATA rows carry GSI1 keys; version snapshot rows omit them entirely
  // so they are excluded from GSI1 via sparse indexing.
  if (sk === METADATA_SK) {
    base.GSI1PK = gsi1Pk(item.subject);
    base.GSI1SK = gsi1Sk(item.metadata.status, item.metadata.created);
  }

  return base;
}

/**
 * Strip internal DynamoDB keys before returning data to handlers / API clients.
 */
export function toExamItem(record: Record<string, unknown>): ExamItem {
  const copy = { ...record };
  for (const key of INTERNAL_KEYS) {
    delete copy[key];
  }
  return copy as unknown as ExamItem;
}

/** Strip content for list responses (GSI1 INCLUDE projection omits content at rest). */
export function toItemSummary(record: Record<string, unknown> | ExamItem): ExamItemSummary {
  const item = 'PK' in record ? toExamItem(record as Record<string, unknown>) : record;
  const { content: _content, ...summary } = item;
  return summary;
}
