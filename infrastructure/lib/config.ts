/**
 * Environment-specific CDK configuration.
 *
 * Select via context: `cdk synth -c env=dev` (default) or `-c env=prod`.
 * Keeps exercise synth valid while demonstrating production-oriented defaults.
 */
import * as cdk from 'aws-cdk-lib';
import * as logs from 'aws-cdk-lib/aws-logs';

export type EnvName = 'dev' | 'prod';

export interface EnvConfig {
  /** Explicit name in dev for local-parity debugging; omitted in prod. */
  tableName?: string;
  tableRemovalPolicy: cdk.RemovalPolicy;
  pointInTimeRecovery: boolean;
  logRetention: logs.RetentionDays;
  lambdaMemoryMb: number;
  corsAllowOrigins: string[];
  /** AWS region for stack deployment (explicit per env). */
  region: string;
  /** AWS account; undefined falls back to CDK_DEFAULT_ACCOUNT at synth/deploy. */
  account?: string;
}

export const ENV_CONFIGS: Record<EnvName, EnvConfig> = {
  dev: {
    tableName: 'ExamItems',
    tableRemovalPolicy: cdk.RemovalPolicy.DESTROY,
    pointInTimeRecovery: false,
    logRetention: logs.RetentionDays.ONE_WEEK,
    lambdaMemoryMb: 256,
    corsAllowOrigins: ['*'],
    region: 'us-east-1',
  },
  prod: {
    // CloudFormation-generated name avoids replacement collisions across accounts.
    tableRemovalPolicy: cdk.RemovalPolicy.RETAIN,
    pointInTimeRecovery: true,
    logRetention: logs.RetentionDays.THREE_MONTHS,
    lambdaMemoryMb: 512,
    corsAllowOrigins: ['https://items.collegeboard.org'],
    region: 'us-east-1',
  },
};

export function resolveEnvName(raw: unknown): EnvName {
  const name = typeof raw === 'string' ? raw : 'dev';
  if (name in ENV_CONFIGS) {
    return name as EnvName;
  }
  throw new Error(`Unknown CDK context env="${name}". Use -c env=dev or -c env=prod.`);
}
