/**
 * Opaque pagination cursors — base64url-encoded JSON.
 * Clients must not parse cursors; they are tied to the storage backend.
 */

import { InvalidCursorError } from '../storage/errors.js';

/** Allowed attribute names in a DynamoDB LastEvaluatedKey for GSI1 list pagination. */
const ALLOWED_DYNAMO_CURSOR_KEYS = new Set(['PK', 'SK', 'GSI1PK', 'GSI1SK']);

export function encodeDynamoCursor(key: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(key)).toString('base64url');
}

/**
 * Decode and validate an opaque list cursor before use as ExclusiveStartKey.
 * Rejects garbage JSON, wrong shapes, and forged keys (client input must not 500).
 */
export function decodeDynamoCursor(cursor: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new InvalidCursorError();
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new InvalidCursorError();
  }

  const record = parsed as Record<string, unknown>;
  const keys = Object.keys(record);
  if (!keys.includes('PK') || !keys.includes('SK')) {
    throw new InvalidCursorError();
  }

  for (const key of keys) {
    if (!ALLOWED_DYNAMO_CURSOR_KEYS.has(key) || typeof record[key] !== 'string') {
      throw new InvalidCursorError();
    }
  }

  return record;
}

export function encodeOffsetCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ offset })).toString('base64url');
}

export function decodeOffsetCursor(cursor: string): number {
  const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
    offset?: number;
  };
  return parsed.offset ?? 0;
}
