/**
 * Opaque pagination cursors — base64url-encoded JSON.
 * Clients must not parse cursors; they are tied to the storage backend.
 */

export function encodeDynamoCursor(key: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(key)).toString('base64url');
}

export function decodeDynamoCursor(cursor: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Record<string, unknown>;
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
