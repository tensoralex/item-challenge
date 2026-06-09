/**
 * Inspect local DynamoDB table health and content invariants.
 *
 * Usage: pnpm db:inspect  (also runs as demo.sh step 12)
 * Requires DynamoDB Local running and .env configured.
 *
 * Invariants checked per item (PK group):
 *   - METADATA row exists with GSI1 keys
 *   - VERSION# snapshots are contiguous 1..N matching metadata.version
 *   - top-level version == metadata.version on METADATA
 *   - VERSION rows have no GSI1 keys (sparse index)
 */

import { DynamoDBClient, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { METADATA_SK, VERSION_PREFIX } from '../src/lib/keys.js';

const endpoint = process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000';
const tableName = process.env.DYNAMODB_TABLE_NAME || 'ExamItems';
const region = process.env.AWS_REGION || 'us-east-1';
const useDynamo = process.env.USE_DYNAMODB !== 'false';

interface Row {
  PK: string;
  SK: string;
  version?: number;
  metadata?: { version?: number };
  GSI1PK?: string;
  GSI1SK?: string;
}

function parseVersionSk(sk: string): number | null {
  if (!sk.startsWith(VERSION_PREFIX)) return null;
  const n = Number(sk.slice(VERSION_PREFIX.length));
  return Number.isInteger(n) && n > 0 ? n : null;
}

function printConfig() {
  console.log('\n=== Configuration ===');
  console.log(`  USE_DYNAMODB:       ${useDynamo}`);
  console.log(`  DYNAMODB_ENDPOINT:  ${endpoint}`);
  console.log(`  DYNAMODB_TABLE_NAME: ${tableName}`);
  console.log(`  AWS_REGION:         ${region}`);
}

async function main() {
  printConfig();

  if (!useDynamo) {
    console.error('\n[error] USE_DYNAMODB=false — inspector requires DynamoDB backend.');
    process.exit(1);
  }

  const client = DynamoDBDocumentClient.from(
    new DynamoDBClient({
      region,
      endpoint,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'local',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'local',
      },
    }),
  );

  console.log('\n=== Table health ===');
  try {
    const desc = await client.send(new DescribeTableCommand({ TableName: tableName }));
    const table = desc.Table;
    console.log(`  Status:       ${table?.TableStatus}`);
    console.log(`  Item count:   ${table?.ItemCount ?? 'unknown'}`);
    console.log(`  Billing mode: ${table?.BillingModeSummary?.BillingMode ?? 'unknown'}`);
    const gsi = table?.GlobalSecondaryIndexes?.map((g) => g.IndexName).join(', ') || 'none';
    console.log(`  GSIs:         ${gsi}`);
  } catch (err) {
    console.error(`\n[error] Cannot describe table '${tableName}' at ${endpoint}`);
    console.error(err);
    process.exit(1);
  }

  console.log('\n=== Content scan ===');
  const rows: Row[] = [];
  let lastKey: Record<string, unknown> | undefined;

  do {
    const page = await client.send(
      new ScanCommand({
        TableName: tableName,
        ExclusiveStartKey: lastKey,
      }),
    );
    rows.push(...((page.Items as Row[]) || []));
    lastKey = page.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey);

  console.log(`  Total rows: ${rows.length}`);

  const byPk = new Map<string, Row[]>();
  for (const row of rows) {
    const list = byPk.get(row.PK) || [];
    list.push(row);
    byPk.set(row.PK, list);
  }

  const violations: string[] = [];
  let itemCount = 0;

  for (const [pk, group] of byPk) {
    const metadata = group.find((r) => r.SK === METADATA_SK);
    const versions = group
      .filter((r) => r.SK.startsWith(VERSION_PREFIX))
      .map((r) => ({ sk: r.SK, n: parseVersionSk(r.SK), row: r }))
      .filter((v): v is { sk: string; n: number; row: Row } => v.n !== null)
      .sort((a, b) => a.n - b.n);

    if (!metadata && versions.length > 0) {
      violations.push(`${pk}: VERSION rows without METADATA`);
      continue;
    }
    if (!metadata) {
      violations.push(`${pk}: orphan row(s) with no METADATA`);
      continue;
    }

    itemCount += 1;

    if (versions.length === 0) {
      violations.push(`${pk}: METADATA without any VERSION snapshot`);
    }

    const metaVersion = metadata.metadata?.version;
    const topVersion = metadata.version;
    if (metaVersion !== undefined && topVersion !== undefined && metaVersion !== topVersion) {
      violations.push(
        `${pk}: top-level version (${topVersion}) != metadata.version (${metaVersion})`,
      );
    }

    const expectedMax = metaVersion ?? topVersion;
    if (expectedMax !== undefined) {
      const nums = versions.map((v) => v.n);
      for (let i = 1; i <= expectedMax; i++) {
        if (!nums.includes(i)) {
          violations.push(`${pk}: missing VERSION# snapshot for version ${i}`);
        }
      }
      const maxSnapshot = nums.length ? Math.max(...nums) : 0;
      if (maxSnapshot !== expectedMax) {
        violations.push(
          `${pk}: highest snapshot version (${maxSnapshot}) != current version (${expectedMax})`,
        );
      }
    }

    if (!metadata.GSI1PK || !metadata.GSI1SK) {
      violations.push(`${pk}: METADATA missing GSI1 keys`);
    }

    for (const v of versions) {
      if (v.row.GSI1PK !== undefined || v.row.GSI1SK !== undefined) {
        violations.push(`${pk}: VERSION row ${v.sk} must not have GSI1 keys (sparse index)`);
      }
    }
  }

  console.log(`  Items (METADATA rows): ${itemCount}`);
  console.log(`  Invariant violations:  ${violations.length}`);

  if (violations.length > 0) {
    console.log('\n=== Violations ===');
    for (const v of violations) {
      console.log(`  - ${v}`);
    }
    process.exit(1);
  }

  console.log('\n[ok] All content invariants passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
