/**
 * Lambda entry: POST /api/items
 * CDK function: CreateItemFn — IAM: TransactWriteItems only (no read).
 */

import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { createItemHandler } from '../handlers/items.js';
import { badJsonResult, parseJson, toResult } from './apigw.js';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const parsed = parseJson(event);
  if (!parsed.ok) return badJsonResult();
  return toResult(await createItemHandler(parsed.value));
};
