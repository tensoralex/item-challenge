/**
 * Lambda entry: PUT /api/items/{id} (optional If-Match header)
 * CDK function: UpdateItemFn — IAM: read + TransactWriteItems.
 */

import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { updateItemHandler } from '../handlers/items.js';
import {
  badJsonResult,
  invalidIfMatchResult,
  parseIfMatch,
  parseJson,
  pathId,
  toResult,
} from './apigw.js';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const parsed = parseJson(event);
  if (!parsed.ok) return badJsonResult();

  const match = parseIfMatch(event);
  if (match.kind === 'invalid') return invalidIfMatchResult();

  const expectedVersion = match.kind === 'valid' ? match.version : undefined;
  return toResult(await updateItemHandler(pathId(event), parsed.value, expectedVersion));
};
