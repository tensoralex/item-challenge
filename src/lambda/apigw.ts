/**
 * Shared API Gateway HTTP API (v2) helpers for Lambda entry points.
 *
 * Mirrors parsing semantics in src/server.ts for local dev parity:
 *   - pathId() extracts {id} from pathParameters
 *   - parseIfMatch() / parseJson() match server.ts header/body parsing
 *   - toResult() serializes handler { statusCode, body } to API Gateway response
 */

import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';

export function toResult(res: { statusCode: number; body: unknown }): APIGatewayProxyResultV2 {
  return {
    statusCode: res.statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(res.body),
  };
}

export function pathId(event: APIGatewayProxyEventV2): string {
  return event.pathParameters?.id ?? '';
}

export type IfMatchResult =
  | { kind: 'absent' }
  | { kind: 'valid'; version: number }
  | { kind: 'invalid' };

/**
 * Parse If-Match header for optimistic locking.
 * Invalid values (non-integer or < 1) must be rejected — not silently ignored.
 */
export function parseIfMatch(event: APIGatewayProxyEventV2): IfMatchResult {
  const raw = event.headers?.['if-match'] ?? event.headers?.['If-Match'];
  if (!raw) return { kind: 'absent' };
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return { kind: 'invalid' };
  return { kind: 'valid', version: n };
}

export function parseJson(
  event: APIGatewayProxyEventV2,
): { ok: true; value: unknown } | { ok: false } {
  if (!event.body) return { ok: true, value: null };
  try {
    return { ok: true, value: JSON.parse(event.body) };
  } catch {
    return { ok: false };
  }
}

export function badJsonResult(): APIGatewayProxyResultV2 {
  return toResult({ statusCode: 400, body: { error: 'Invalid JSON body' } });
}

export function invalidIfMatchResult(): APIGatewayProxyResultV2 {
  return toResult({ statusCode: 400, body: { error: 'Invalid If-Match header' } });
}
