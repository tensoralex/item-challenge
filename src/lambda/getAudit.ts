/**
 * Lambda entry: GET /api/items/{id}/audit
 * CDK function: GetAuditFn — IAM: read (Query on VERSION# rows).
 */

import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { getAuditTrailHandler } from '../handlers/items.js';
import { pathId, toResult } from './apigw.js';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  return toResult(await getAuditTrailHandler(pathId(event)));
};
