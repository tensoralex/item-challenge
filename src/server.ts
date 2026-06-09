/**
 * Local Development Server — dev-only HTTP adapter.
 *
 * Production entry points are src/lambda/*.ts behind API Gateway.
 * This server maps raw HTTP requests to the same Lambda-shaped handlers
 * in src/handlers/items.ts so local behavior matches deployed behavior.
 *
 * Run with: pnpm dev
 */

import { createServer, IncomingMessage, ServerResponse, Server } from 'http';
import { pathToFileURL } from 'url';
import {
  createItemHandler,
  createVersionHandler,
  getItemHandler,
  updateItemHandler,
  getAuditTrailHandler,
  listItemsHandler,
} from './handlers/items.js';

function parsePathSegments(url: string | undefined): string[] {
  return (url ?? '').split('?')[0].split('/').filter(Boolean);
}

function parseQueryParams(url: string | undefined): Record<string, string> {
  const query = (url ?? '').split('?')[1];
  if (!query) return {};
  const params: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(query)) {
    params[key] = value;
  }
  return params;
}

/** Max request body size (mirrors API Gateway payload limit). */
const MAX_BODY_BYTES = 1_048_576;

type IfMatchParse = { kind: 'absent' } | { kind: 'valid'; version: number } | { kind: 'invalid' };

/** Strict positive-integer version token — rejects scientific notation, decimals, signs. */
const IF_MATCH_VERSION_RE = /^[1-9]\d*$/;

function parseIfMatchVersion(req: IncomingMessage): IfMatchParse {
  const raw = req.headers['if-match'];
  if (!raw || Array.isArray(raw)) return { kind: 'absent' };
  if (!IF_MATCH_VERSION_RE.test(raw)) return { kind: 'invalid' };
  return { kind: 'valid', version: Number(raw) };
}

async function handleRequest(req: IncomingMessage, res: ServerResponse) {
  const { method, url } = req;

  // Parse request body (with size cap — drain oversized uploads, then respond 413)
  let body = '';
  let bodyTooLarge = false;
  req.on('data', (chunk: string | Buffer) => {
    if (bodyTooLarge) return;
    body += chunk;
    if (body.length > MAX_BODY_BYTES) {
      bodyTooLarge = true;
      body = '';
    }
  });
  await new Promise((resolve) => req.on('end', resolve));

  if (bodyTooLarge) {
    res.writeHead(413, {
      'Content-Type': 'application/json',
      Connection: 'close',
    });
    res.end(JSON.stringify({ error: 'Request body too large' }));
    return;
  }

  let parsedBody: unknown = null;
  if (body) {
    try {
      parsedBody = JSON.parse(body);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON body' }));
      return;
    }
  }

  console.log(`${method} ${url}`);

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, If-Match');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    const segments = parsePathSegments(url);
    let result;

    // Route matching order matters: audit/versions (4 segments) before :id (3 segments).
    // POST /api/items
    if (
      method === 'POST' &&
      segments.length === 2 &&
      segments[0] === 'api' &&
      segments[1] === 'items'
    ) {
      result = await createItemHandler(parsedBody);
    }
    // GET /api/items?subject=... (list — subject required)
    else if (
      method === 'GET' &&
      segments.length === 2 &&
      segments[0] === 'api' &&
      segments[1] === 'items'
    ) {
      result = await listItemsHandler(parseQueryParams(url));
    }
    // GET /api/items/:id/audit
    else if (
      method === 'GET' &&
      segments.length === 4 &&
      segments[0] === 'api' &&
      segments[1] === 'items' &&
      segments[3] === 'audit'
    ) {
      result = await getAuditTrailHandler(segments[2]);
    }
    // POST /api/items/:id/versions
    else if (
      method === 'POST' &&
      segments.length === 4 &&
      segments[0] === 'api' &&
      segments[1] === 'items' &&
      segments[3] === 'versions'
    ) {
      result = await createVersionHandler(segments[2]);
    }
    // GET /api/items/:id
    else if (
      method === 'GET' &&
      segments.length === 3 &&
      segments[0] === 'api' &&
      segments[1] === 'items'
    ) {
      result = await getItemHandler(segments[2]);
    }
    // PUT /api/items/:id
    else if (
      method === 'PUT' &&
      segments.length === 3 &&
      segments[0] === 'api' &&
      segments[1] === 'items'
    ) {
      const ifMatch = parseIfMatchVersion(req);
      if (ifMatch.kind === 'invalid') {
        result = {
          statusCode: 400,
          body: { error: 'Invalid If-Match header' },
        };
      } else {
        const expectedVersion = ifMatch.kind === 'valid' ? ifMatch.version : undefined;
        result = await updateItemHandler(segments[2], parsedBody, expectedVersion);
      }
    } else {
      result = {
        statusCode: 404,
        body: { error: 'Route not found' },
      };
    }

    res.writeHead(result.statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result.body));
  } catch (error) {
    console.error('Server error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
}

export function startServer(
  port: number = Number(process.env.PORT) || 3000,
): Promise<{ server: Server; baseUrl: string }> {
  return new Promise((resolve) => {
    const server = createServer(handleRequest);
    server.listen(port, () => {
      const addr = server.address();
      const actualPort = typeof addr === 'object' && addr ? addr.port : port;
      resolve({ server, baseUrl: `http://127.0.0.1:${actualPort}` });
    });
  });
}

function logEndpoints(baseUrl: string) {
  console.log(`\n🚀 Server running at ${baseUrl}`);
  console.log(`\nEndpoints:`);
  console.log(`  POST   ${baseUrl}/api/items`);
  console.log(`  GET    ${baseUrl}/api/items?subject=<subject>&status=&limit=&cursor=`);
  console.log(`  GET    ${baseUrl}/api/items/:id`);
  console.log(`  PUT    ${baseUrl}/api/items/:id  (optional If-Match: <version>)`);
  console.log(`  POST   ${baseUrl}/api/items/:id/versions`);
  console.log(`  GET    ${baseUrl}/api/items/:id/audit`);
  console.log(`\nPress Ctrl+C to stop\n`);
}

// Auto-start only when run directly (pnpm dev / node), not when imported by tests.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer().then(({ baseUrl }) => logEndpoints(baseUrl));
}
