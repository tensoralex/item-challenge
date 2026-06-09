/**
 * Lambda entry: POST /api/items/{id}/versions
 * CDK function: CreateVersionFn — IAM: read + TransactWriteItems.
 */

import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { createVersionHandler } from '../handlers/items.js';
import { pathId, toResult } from './apigw.js';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  return toResult(await createVersionHandler(pathId(event)));
};
