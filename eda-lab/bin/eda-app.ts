#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { EDAAppStack } from "../lib/eda-app-stack";

const app = new cdk.App();
new EDAAppStack(app, "EDAStack", {
  env: { region: "us-east-1" },
});
