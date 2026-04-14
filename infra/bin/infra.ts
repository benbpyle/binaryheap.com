#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { BinaryheapWebsiteStack } from "../lib/binaryheap-website-stack";

const app = new cdk.App();

new BinaryheapWebsiteStack(app, "BinaryheapWebsiteStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: "us-east-1",
  },
});
