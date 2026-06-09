/**
 * Lambda entry: GET /api/items?subject=...
 * CDK function: ListItemsFn — IAM: read (Query on GSI1).
 */

import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { listItemsHandler } from '../handlers/items.js';
import { toResult } from './apigw.js';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  return toResult(await listItemsHandler(event.queryStringParameters ?? {}));
};
