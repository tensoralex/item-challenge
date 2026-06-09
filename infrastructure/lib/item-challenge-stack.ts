/**
 * Serverless stack: DynamoDB single-table, per-endpoint Lambdas, HTTP API.
 *
 * Exercise scope: valid `cdk synth` with least-privilege IAM — not deployed.
 * Environment-specific defaults live in config.ts (dev vs prod).
 */
import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { EnvConfig } from './config';

const REPO_ROOT = path.join(__dirname, '../..');

export interface ItemChallengeStackProps extends cdk.StackProps {
  config: EnvConfig;
}

export class ItemChallengeStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ItemChallengeStackProps) {
    super(scope, id, props);

    const { config } = props;

    // PAY_PER_REQUEST: authoring workloads are spiky; avoids capacity planning.
    const table = new dynamodb.Table(this, 'ExamItems', {
      ...(config.tableName && { tableName: config.tableName }),
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: config.pointInTimeRecovery,
      },
      removalPolicy: config.tableRemovalPolicy,
    });

    // INCLUDE projection: list responses never need content (read cost + security).
    // Changing projection in production recreates the GSI.
    table.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.INCLUDE,
      nonKeyAttributes: ['id', 'subject', 'itemType', 'difficulty', 'securityLevel', 'metadata'],
    });

    const makeFn = (fnId: string, entryRel: string): NodejsFunction => {
      // Explicit LogGroup per function — avoids deprecated logRetention custom resource.
      const logGroup = new logs.LogGroup(this, `${fnId}Logs`, {
        retention: config.logRetention,
        removalPolicy: config.tableRemovalPolicy,
      });

      return new NodejsFunction(this, fnId, {
        entry: path.join(REPO_ROOT, entryRel),
        handler: 'handler',
        runtime: lambda.Runtime.NODEJS_22_X,
        // ARM_64: lower cost vs x86; no native dependencies in handler bundle.
        architecture: lambda.Architecture.ARM_64,
        memorySize: config.lambdaMemoryMb,
        timeout: cdk.Duration.seconds(10),
        // X-Ray: distributed tracing for serverless observability.
        tracing: lambda.Tracing.ACTIVE,
        environment: {
          DYNAMODB_TABLE_NAME: table.tableName,
          // Enable source maps shipped by esbuild bundling.
          NODE_OPTIONS: '--enable-source-maps',
        },
        logGroup,
        projectRoot: REPO_ROOT,
        depsLockFilePath: path.join(__dirname, '../package-lock.json'),
        bundling: {
          // AWS SDK v3 is provided by the Node.js 22 Lambda runtime.
          externalModules: ['@aws-sdk/*'],
          minify: true,
          sourceMap: true,
        },
      });
    };

    // One Lambda per endpoint — enables least-privilege IAM (see grants below).
    const createFn = makeFn('CreateItemFn', 'src/lambda/createItem.ts');
    const listFn = makeFn('ListItemsFn', 'src/lambda/listItems.ts');
    const getFn = makeFn('GetItemFn', 'src/lambda/getItem.ts');
    const updateFn = makeFn('UpdateItemFn', 'src/lambda/updateItem.ts');
    const versionFn = makeFn('CreateVersionFn', 'src/lambda/createVersion.ts');
    const auditFn = makeFn('GetAuditFn', 'src/lambda/getAudit.ts');

    // Least-privilege IAM — TransactWriteItems is not included in grantWriteData.
    table.grant(createFn, 'dynamodb:TransactWriteItems');
    table.grantReadData(listFn);
    table.grantReadData(getFn);
    table.grantReadData(updateFn);
    table.grant(updateFn, 'dynamodb:TransactWriteItems');
    table.grantReadData(versionFn);
    table.grant(versionFn, 'dynamodb:TransactWriteItems');
    table.grantReadData(auditFn);

    const httpApi = new apigwv2.HttpApi(this, 'ItemApi', {
      apiName: 'item-challenge-api',
      corsPreflight: {
        allowOrigins: config.corsAllowOrigins,
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.PUT,
          apigwv2.CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ['content-type', 'if-match'],
      },
    });

    httpApi.addRoutes({
      path: '/api/items',
      methods: [apigwv2.HttpMethod.POST],
      integration: new HttpLambdaIntegration('CreateIntegration', createFn),
    });

    httpApi.addRoutes({
      path: '/api/items',
      methods: [apigwv2.HttpMethod.GET],
      integration: new HttpLambdaIntegration('ListIntegration', listFn),
    });

    httpApi.addRoutes({
      path: '/api/items/{id}',
      methods: [apigwv2.HttpMethod.GET],
      integration: new HttpLambdaIntegration('GetIntegration', getFn),
    });

    httpApi.addRoutes({
      path: '/api/items/{id}',
      methods: [apigwv2.HttpMethod.PUT],
      integration: new HttpLambdaIntegration('UpdateIntegration', updateFn),
    });

    httpApi.addRoutes({
      path: '/api/items/{id}/versions',
      methods: [apigwv2.HttpMethod.POST],
      integration: new HttpLambdaIntegration('VersionIntegration', versionFn),
    });

    httpApi.addRoutes({
      path: '/api/items/{id}/audit',
      methods: [apigwv2.HttpMethod.GET],
      integration: new HttpLambdaIntegration('AuditIntegration', auditFn),
    });

    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: httpApi.apiEndpoint,
      description: 'HTTP API base URL',
    });

    new cdk.CfnOutput(this, 'TableName', {
      value: table.tableName,
      description: 'DynamoDB table name',
    });
  }
}
