/**
 * CDK assertion tests — validate synthesized CloudFormation per environment.
 */

import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { ENV_CONFIGS, resolveEnvName } from '../lib/config';
import { ItemChallengeStack } from '../lib/item-challenge-stack';

function synthTemplate(envName: 'dev' | 'prod') {
  const app = new App();
  const config = ENV_CONFIGS[envName];
  const stack = new ItemChallengeStack(app, `TestStack-${envName}`, { config });
  return Template.fromStack(stack);
}

describe('ItemChallengeStack', () => {
  describe('dev', () => {
    const template = synthTemplate('dev');

    it('creates DynamoDB table with dev settings', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        BillingMode: 'PAY_PER_REQUEST',
        TableName: 'ExamItems',
        PointInTimeRecoverySpecification: {
          PointInTimeRecoveryEnabled: false,
        },
      });
      template.hasResource('AWS::DynamoDB::Table', {
        DeletionPolicy: 'Delete',
        UpdateReplacePolicy: 'Delete',
      });
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        GlobalSecondaryIndexes: Match.arrayWith([
          Match.objectLike({
            IndexName: 'GSI1',
            Projection: {
              ProjectionType: 'INCLUDE',
              NonKeyAttributes: Match.arrayWith([
                'id',
                'subject',
                'itemType',
                'difficulty',
                'securityLevel',
                'metadata',
              ]),
            },
          }),
        ]),
      });
    });

    it('creates six Node 22 Lambdas with X-Ray and dev memory', () => {
      template.resourceCountIs('AWS::Lambda::Function', 6);
      template.hasResourceProperties('AWS::Lambda::Function', {
        Runtime: 'nodejs22.x',
        Architectures: ['arm64'],
        MemorySize: 256,
        TracingConfig: { Mode: 'Active' },
        Environment: {
          Variables: Match.objectLike({
            NODE_OPTIONS: '--enable-source-maps',
          }),
        },
      });
    });

    it('scopes create Lambda to TransactWriteItems only (plus X-Ray)', () => {
      const policies = template.findResources('AWS::IAM::Policy');
      const createPolicy = Object.values(policies).find((p) =>
        JSON.stringify(p).includes('CreateItemFn'),
      );
      expect(createPolicy).toBeDefined();
      const doc = (createPolicy as { Properties: { PolicyDocument: unknown } }).Properties
        .PolicyDocument;
      const docStr = JSON.stringify(doc);
      expect(docStr).toContain('dynamodb:TransactWriteItems');
      expect(docStr).not.toContain('dynamodb:PutItem');
    });

    it('exposes six HTTP API routes with dev CORS', () => {
      template.resourceCountIs('AWS::ApiGatewayV2::Route', 6);
      template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
        CorsConfiguration: Match.objectLike({
          AllowOrigins: ['*'],
        }),
      });
    });

    it('uses one-week log retention', () => {
      template.hasResourceProperties('AWS::Logs::LogGroup', {
        RetentionInDays: 7,
      });
    });
  });

  describe('prod', () => {
    const template = synthTemplate('prod');

    it('creates DynamoDB table with prod settings', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        PointInTimeRecoverySpecification: {
          PointInTimeRecoveryEnabled: true,
        },
      });
      template.hasResource('AWS::DynamoDB::Table', {
        DeletionPolicy: 'Retain',
        UpdateReplacePolicy: 'Retain',
      });
      // No explicit table name in prod.
      const tables = template.findResources('AWS::DynamoDB::Table');
      const tableProps = Object.values(tables)[0] as {
        Properties: { TableName?: string };
      };
      expect(tableProps.Properties.TableName).toBeUndefined();
    });

    it('uses prod Lambda memory and CORS allowlist', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        MemorySize: 512,
      });
      template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
        CorsConfiguration: Match.objectLike({
          AllowOrigins: ['https://items.collegeboard.org'],
        }),
      });
    });

    it('uses three-month log retention', () => {
      template.hasResourceProperties('AWS::Logs::LogGroup', {
        RetentionInDays: 90,
      });
    });
  });
});

describe('resolveEnvName', () => {
  it('defaults to dev', () => {
    expect(resolveEnvName(undefined)).toBe('dev');
  });

  it('accepts dev and prod', () => {
    expect(resolveEnvName('dev')).toBe('dev');
    expect(resolveEnvName('prod')).toBe('prod');
  });

  it('throws on unknown env', () => {
    expect(() => resolveEnvName('staging')).toThrow(/Unknown CDK context env/);
  });
});
