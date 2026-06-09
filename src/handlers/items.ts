/**
 * Exam item API handlers — Lambda-shaped (statusCode + body).
 *
 * Stateless: module-level storage singleton; env-driven backend selection.
 * Each handler is HTTP-agnostic — local server.ts and src/lambda/* adapters
 * call these directly. See EXERCISE_DOCUMENTATION.md for the full route map.
 */

import { createStorage } from '../storage/index.js';
import {
  createItemSchema,
  itemIdSchema,
  listItemsQuerySchema,
  updateItemSchema,
} from '../validation/schemas.js';
import { toErrorResponse } from './http.js';

const storage = createStorage();

function missingIdResponse() {
  return { statusCode: 400, body: { error: 'Missing item id' } };
}

function invalidIdResponse() {
  return { statusCode: 400, body: { error: 'Invalid item id' } };
}

/**
 * Two-step id validation: empty/missing → 400 "Missing item id";
 * malformed (non-uuid) → 400 "Invalid item id". Rejects bad ids before DynamoDB round-trip.
 */
function parseItemId(id: string) {
  if (!id?.trim()) return { ok: false as const, response: missingIdResponse() };
  const parsed = itemIdSchema.safeParse(id);
  if (!parsed.success) return { ok: false as const, response: invalidIdResponse() };
  return { ok: true as const, id: parsed.data };
}

/** POST /api/items — 201 on success; 400 on validation failure. */
export async function createItemHandler(body: unknown) {
  try {
    const data = createItemSchema.parse(body);
    const item = await storage.createItem(data);
    return { statusCode: 201, body: item };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** GET /api/items/:id — 200 with full item; 404 if absent; 400 on malformed id. */
export async function getItemHandler(id: string) {
  const parsed = parseItemId(id);
  if (!parsed.ok) return parsed.response;

  try {
    const item = await storage.getItem(parsed.id);
    if (!item) {
      return { statusCode: 404, body: { error: 'Item not found' } };
    }
    return { statusCode: 200, body: item };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * PUT /api/items/:id — partial update; bumps version + audit snapshot.
 * expectedVersion comes from If-Match header (parsed by server.ts or lambda adapter).
 * 200 on success; 404 if absent; 409 on optimistic lock conflict; 400 on validation.
 */
export async function updateItemHandler(id: string, body: unknown, expectedVersion?: number) {
  const parsed = parseItemId(id);
  if (!parsed.ok) return parsed.response;

  try {
    const data = updateItemSchema.parse(body);
    const item = await storage.updateItem(parsed.id, data, expectedVersion);
    if (!item) {
      return { statusCode: 404, body: { error: 'Item not found' } };
    }
    return { statusCode: 200, body: item };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * GET /api/items?subject=... — GSI1 list; summaries omit content (answers).
 * subject is required (listItemsQuerySchema). 200 with items + count + optional nextCursor.
 */
export async function listItemsHandler(query: unknown) {
  try {
    const params = listItemsQuerySchema.parse(query);
    const result = await storage.listItems(params);
    return {
      statusCode: 200,
      body: {
        items: result.items,
        count: result.count,
        ...(result.nextCursor && { nextCursor: result.nextCursor }),
      },
    };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * POST /api/items/:id/versions — explicit version checkpoint without content change.
 * 201 on success; 404 if absent; 409 on concurrent write conflict.
 */
export async function createVersionHandler(id: string) {
  const parsed = parseItemId(id);
  if (!parsed.ok) return parsed.response;

  try {
    const item = await storage.createVersion(parsed.id);
    if (!item) {
      return { statusCode: 404, body: { error: 'Item not found' } };
    }
    return { statusCode: 201, body: item };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * GET /api/items/:id/audit — immutable version history ordered by version number.
 * 200 with versions[] + total; 404 if item has no history (never created).
 */
export async function getAuditTrailHandler(id: string) {
  const parsed = parseItemId(id);
  if (!parsed.ok) return parsed.response;

  try {
    const versions = await storage.getAuditTrail(parsed.id);
    if (versions.length === 0) {
      return { statusCode: 404, body: { error: 'Item not found' } };
    }
    return {
      statusCode: 200,
      body: { versions, total: versions.length },
    };
  } catch (err) {
    return toErrorResponse(err);
  }
}
