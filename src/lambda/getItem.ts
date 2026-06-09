/**
 * Lambda entry: GET /api/items/{id}
 * CDK function: GetItemFn — IAM: read (GetItem).
 */

import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { getItemHandler } from '../handlers/items.js';
import { pathId, toResult } from './apigw.js';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  return toResult(await getItemHandler(pathId(event)));
};
