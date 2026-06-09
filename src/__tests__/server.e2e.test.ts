/**
 * End-to-end HTTP harness — boots real server, hits routes via fetch().
 * Gated on DynamoDB Local (skips cleanly when unreachable).
 */

import { DynamoDBClient, ListTablesCommand } from '@aws-sdk/client-dynamodb';
import type { Server } from 'http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer } from '../server.js';
import { ABSENT_ITEM_ID } from '../validation/schemas.js';

const ENDPOINT = process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000';

async function isDynamoDbLocalReady(): Promise<boolean> {
  try {
    const client = new DynamoDBClient({
      region: 'us-east-1',
      endpoint: ENDPOINT,
      credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
    });
    await client.send(new ListTablesCommand({}));
    return true;
  } catch {
    return false;
  }
}

function validCreate(subject: string) {
  return {
    subject,
    itemType: 'multiple-choice' as const,
    difficulty: 3,
    content: {
      question: 'E2E question?',
      options: ['A', 'B'],
      correctAnswer: 'A',
      explanation: 'Because.',
    },
    metadata: {
      author: 'e2e-test',
      status: 'draft' as const,
      tags: ['e2e'],
    },
    securityLevel: 'standard' as const,
  };
}

async function api(
  baseUrl: string,
  method: string,
  path: string,
  options?: { body?: unknown; rawBody?: string; ifMatch?: number; ifMatchRaw?: string },
) {
  const headers: Record<string, string> = {};
  let body: string | undefined;

  if (options?.rawBody !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = options.rawBody;
  } else if (options?.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  if (options?.ifMatchRaw !== undefined) {
    headers['If-Match'] = options.ifMatchRaw;
  } else if (options?.ifMatch !== undefined) {
    headers['If-Match'] = String(options.ifMatch);
  }

  const res = await fetch(`${baseUrl}${path}`, { method, headers, body });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  if (text) {
    try {
      json = JSON.parse(text) as Record<string, unknown>;
    } catch {
      json = { raw: text };
    }
  }
  return { status: res.status, json };
}

describe('HTTP server e2e', () => {
  let skip = true;
  let server: Server;
  let baseUrl = '';
  const subject = `E2E ${Date.now()}`;

  beforeAll(async () => {
    skip = !(await isDynamoDbLocalReady());
    if (skip) return;

    const started = await startServer(0);
    server = started.server;
    baseUrl = started.baseUrl;
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  it('POST /api/items creates item with version 1', async (ctx) => {
    if (skip) ctx.skip();

    const { status, json } = await api(baseUrl, 'POST', '/api/items', {
      body: validCreate(subject),
    });

    expect(status).toBe(201);
    expect(json).toHaveProperty('id');
    const metadata = json.metadata as { version: number };
    expect(metadata.version).toBe(1);
  });

  it('POST /api/items rejects forged server-owned fields', async (ctx) => {
    if (skip) ctx.skip();

    const { status, json } = await api(baseUrl, 'POST', '/api/items', {
      body: { ...validCreate(subject), id: 'forged' },
    });

    expect(status).toBe(400);
    expect(json.error).toBe('Validation failed');
  });

  it('POST /api/items rejects invalid JSON body', async (ctx) => {
    if (skip) ctx.skip();

    const { status, json } = await api(baseUrl, 'POST', '/api/items', {
      rawBody: '{not-json',
    });

    expect(status).toBe(400);
    expect(json.error).toBe('Invalid JSON body');
  });

  it('GET /api/items/:id returns 200 for existing item', async (ctx) => {
    if (skip) ctx.skip();

    const created = await api(baseUrl, 'POST', '/api/items', {
      body: validCreate(`${subject}-get`),
    });
    const id = created.json.id as string;

    const { status, json } = await api(baseUrl, 'GET', `/api/items/${id}`);

    expect(status).toBe(200);
    expect(json.id).toBe(id);
  });

  it('GET /api/items/:id returns 400 for malformed id', async (ctx) => {
    if (skip) ctx.skip();

    const { status, json } = await api(baseUrl, 'GET', '/api/items/not-a-uuid');

    expect(status).toBe(400);
    expect(json.error).toBe('Invalid item id');
  });

  it('GET /api/items/:id returns 404 for unknown id', async (ctx) => {
    if (skip) ctx.skip();

    const { status, json } = await api(baseUrl, 'GET', `/api/items/${ABSENT_ITEM_ID}`);

    expect(status).toBe(404);
    expect(json.error).toBe('Item not found');
  });

  it('PUT /api/items/:id updates and bumps version', async (ctx) => {
    if (skip) ctx.skip();

    const created = await api(baseUrl, 'POST', '/api/items', {
      body: validCreate(`${subject}-put`),
    });
    const id = created.json.id as string;

    const { status, json } = await api(baseUrl, 'PUT', `/api/items/${id}`, {
      body: { metadata: { status: 'review' } },
    });

    expect(status).toBe(200);
    const metadata = json.metadata as { version: number; status: string };
    expect(metadata.version).toBe(2);
    expect(metadata.status).toBe('review');
  });

  it('PUT /api/items/:id returns 409 on stale If-Match', async (ctx) => {
    if (skip) ctx.skip();

    const created = await api(baseUrl, 'POST', '/api/items', {
      body: validCreate(`${subject}-conflict`),
    });
    const id = created.json.id as string;

    await api(baseUrl, 'PUT', `/api/items/${id}`, {
      body: { difficulty: 4 },
    });

    const { status, json } = await api(baseUrl, 'PUT', `/api/items/${id}`, {
      body: { difficulty: 5 },
      ifMatch: 1,
    });

    expect(status).toBe(409);
    expect(json).toHaveProperty('error');
  });

  it('PUT /api/items/:id returns 400 for invalid body', async (ctx) => {
    if (skip) ctx.skip();

    const created = await api(baseUrl, 'POST', '/api/items', {
      body: validCreate(`${subject}-put400`),
    });
    const id = created.json.id as string;

    const { status, json } = await api(baseUrl, 'PUT', `/api/items/${id}`, {
      body: { metadata: { version: 99 } },
    });

    expect(status).toBe(400);
    expect(json.error).toBe('Validation failed');
  });

  it('PUT /api/items/:id returns 404 for unknown id', async (ctx) => {
    if (skip) ctx.skip();

    const { status, json } = await api(baseUrl, 'PUT', `/api/items/${ABSENT_ITEM_ID}`, {
      body: { difficulty: 2 },
    });

    expect(status).toBe(404);
    expect(json.error).toBe('Item not found');
  });

  it('GET /api/items/:id/audit returns ordered version snapshots', async (ctx) => {
    if (skip) ctx.skip();

    const created = await api(baseUrl, 'POST', '/api/items', {
      body: validCreate(`${subject}-audit`),
    });
    const id = created.json.id as string;

    await api(baseUrl, 'PUT', `/api/items/${id}`, {
      body: { difficulty: 4 },
    });

    const { status, json } = await api(baseUrl, 'GET', `/api/items/${id}/audit`);

    expect(status).toBe(200);
    expect(json.total).toBe(2);
    const versions = json.versions as Array<{ metadata: { version: number } }>;
    expect(versions[0].metadata.version).toBe(1);
    expect(versions[1].metadata.version).toBe(2);
  });

  it('GET /api/items/:id/audit returns 404 for unknown id', async (ctx) => {
    if (skip) ctx.skip();

    const { status, json } = await api(baseUrl, 'GET', `/api/items/${ABSENT_ITEM_ID}/audit`);

    expect(status).toBe(404);
    expect(json.error).toBe('Item not found');
  });

  it('OPTIONS /api/items returns 204 CORS preflight', async (ctx) => {
    if (skip) ctx.skip();

    const { status } = await api(baseUrl, 'OPTIONS', '/api/items');

    expect(status).toBe(204);
  });

  it('GET /api/items returns 400 without subject', async (ctx) => {
    if (skip) ctx.skip();

    const { status, json } = await api(baseUrl, 'GET', '/api/items');

    expect(status).toBe(400);
    expect(json.error).toBe('Validation failed');
  });

  it('GET /api/items returns summaries for subject query', async (ctx) => {
    if (skip) ctx.skip();

    const listSubject = `${subject}-list`;
    await api(baseUrl, 'POST', '/api/items', {
      body: validCreate(listSubject),
    });

    const { status, json } = await api(
      baseUrl,
      'GET',
      `/api/items?subject=${encodeURIComponent(listSubject)}`,
    );

    expect(status).toBe(200);
    expect(json.count).toBeGreaterThanOrEqual(1);
    const items = json.items as Array<Record<string, unknown>>;
    expect(items[0]).not.toHaveProperty('content');
  });

  it('POST /api/items/:id/versions creates checkpoint version', async (ctx) => {
    if (skip) ctx.skip();

    const created = await api(baseUrl, 'POST', '/api/items', {
      body: validCreate(`${subject}-version`),
    });
    const id = created.json.id as string;

    const { status, json } = await api(baseUrl, 'POST', `/api/items/${id}/versions`);

    expect(status).toBe(201);
    const metadata = json.metadata as { version: number };
    expect(metadata.version).toBe(2);

    const audit = await api(baseUrl, 'GET', `/api/items/${id}/audit`);
    expect(audit.json.total).toBe(2);
  });

  it('PUT /api/items/:id returns 400 for invalid If-Match header', async (ctx) => {
    if (skip) ctx.skip();

    const created = await api(baseUrl, 'POST', '/api/items', {
      body: validCreate(`${subject}-ifmatch-bad`),
    });
    const id = created.json.id as string;

    const { status, json } = await api(baseUrl, 'PUT', `/api/items/${id}`, {
      body: { difficulty: 4 },
      ifMatchRaw: 'garbage',
    });

    expect(status).toBe(400);
    expect(json.error).toBe('Invalid If-Match header');
  });

  it('PUT /api/items/:id returns 400 for empty update body', async (ctx) => {
    if (skip) ctx.skip();

    const created = await api(baseUrl, 'POST', '/api/items', {
      body: validCreate(`${subject}-empty-update`),
    });
    const id = created.json.id as string;

    const { status, json } = await api(baseUrl, 'PUT', `/api/items/${id}`, {
      body: {},
    });

    expect(status).toBe(400);
    expect(json.error).toBe('Validation failed');
  });

  it('POST /api/items returns 413 for oversized body', async (ctx) => {
    if (skip) ctx.skip();

    const oversized = JSON.stringify({
      ...validCreate(`${subject}-big`),
      content: {
        ...validCreate(`${subject}-big`).content,
        question: 'x'.repeat(1_100_000),
      },
    });

    const { status, json } = await api(baseUrl, 'POST', '/api/items', {
      rawBody: oversized,
    });

    expect(status).toBe(413);
    expect(json.error).toBe('Request body too large');
  });
});
