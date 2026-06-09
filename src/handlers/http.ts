/**
 * Shared HTTP response helpers for Lambda-shaped handlers.
 *
 * Error-to-status mapping (used by all handlers via toErrorResponse):
 *   ZodError              → 400  { error: 'Validation failed', details }
 *   InvalidCursorError    → 400  { error: 'Invalid cursor' }
 *   OptimisticLockError   → 409  { error: message }
 *   anything else         → 500  { error: 'Internal server error' }
 *
 * Handlers return additional 400/404 responses directly for id/body validation.
 */

import { ZodError } from 'zod';
import { InvalidCursorError, OptimisticLockError } from '../storage/errors.js';

export interface HandlerResponse {
  statusCode: number;
  body: Record<string, unknown>;
}

/**
 * Map storage/validation errors to consistent HTTP-style responses.
 */
export function toErrorResponse(err: unknown): HandlerResponse {
  if (err instanceof ZodError) {
    return {
      statusCode: 400,
      body: {
        error: 'Validation failed',
        details: err.issues,
      },
    };
  }

  if (err instanceof InvalidCursorError) {
    return {
      statusCode: 400,
      body: { error: 'Invalid cursor' },
    };
  }

  if (err instanceof OptimisticLockError) {
    return {
      statusCode: 409,
      body: { error: err.message },
    };
  }

  console.error('Unhandled handler error:', err);
  return {
    statusCode: 500,
    body: { error: 'Internal server error' },
  };
}
