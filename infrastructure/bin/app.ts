#!/usr/bin/env node
/**
 * CDK app entry — synthesize only (no deploy required for exercise).
 *
 * Environment: `cdk synth -c env=dev` (default) or `-c env=prod`.
 */
import * as cdk from 'aws-cdk-lib';
import { ENV_CONFIGS, resolveEnvName } from '../lib/config';
import { ItemChallengeStack } from '../lib/item-challenge-stack';

const app = new cdk.App();
const envName = resolveEnvName(app.node.tryGetContext('env'));
const config = ENV_CONFIGS[envName];

cdk.Tags.of(app).add('project', 'item-challenge');
cdk.Tags.of(app).add('environment', envName);

new ItemChallengeStack(app, `ItemChallengeStack-${envName}`, {
  env: {
    account: config.account ?? process.env.CDK_DEFAULT_ACCOUNT,
    region: config.region,
  },
  description: `Exam item management API (${envName}) — College Board take-home exercise`,
  config,
});
