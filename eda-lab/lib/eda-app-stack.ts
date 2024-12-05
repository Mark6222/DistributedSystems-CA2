import * as cdk from "aws-cdk-lib";
import * as lambdanode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as events from "aws-cdk-lib/aws-lambda-event-sources";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subs from "aws-cdk-lib/aws-sns-subscriptions";
import * as iam from "aws-cdk-lib/aws-iam";
import { Duration, RemovalPolicy } from "aws-cdk-lib";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { Construct } from "constructs";
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';

// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class EDAAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const imagesBucket = new s3.Bucket(this, "images", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      publicReadAccess: false,
    });

    const imagesTable = new dynamodb.Table(this, "ImagesTable", {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: "fileName", type: dynamodb.AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      tableName: "Images",
    });

    const deadLetterQueue = new sqs.Queue(this, "DeadLetterQueue", {
      retentionPeriod: Duration.minutes(1),
    });

    const imageProcessQueue = new sqs.Queue(this, "img-created-queue", {
      receiveMessageWaitTime: cdk.Duration.seconds(10),
      deadLetterQueue: {
        queue: deadLetterQueue,
        maxReceiveCount: 2,
      },
    });

    const mailerQ = new sqs.Queue(this, "mailer-queue", {
      receiveMessageWaitTime: cdk.Duration.seconds(10),
    });

    const newImageTopic = new sns.Topic(this, "NewImageTopic", {
      displayName: "New Image topic",
    });

    // Lambda functions

    const processImageFn = new lambdanode.NodejsFunction(
      this,
      "ProcessImageFn",
      {
        runtime: lambda.Runtime.NODEJS_18_X,
        entry: `${__dirname}/../lambdas/processImage.ts`,
        timeout: cdk.Duration.seconds(15),
        memorySize: 128,
      }
    );
    const failedImageFn = new lambdanode.NodejsFunction(this, "FailedImageFn", {
        runtime: lambda.Runtime.NODEJS_18_X,
        entry: `${__dirname}/../lambdas/rejectionMailer.ts`,
        timeout: cdk.Duration.seconds(15),
        memorySize: 128,
      }
    );
    const mailerFn = new lambdanode.NodejsFunction(this, "mailer-function", {
      runtime: lambda.Runtime.NODEJS_16_X,
      memorySize: 1024,
      timeout: cdk.Duration.seconds(3),
      entry: `${__dirname}/../lambdas/mailer.ts`,
    });

    processImageFn.addEnvironment('TABLE_NAME', imagesTable.tableName);

    // S3 --> SQS
    imagesBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.SnsDestination(newImageTopic)
    );

    // SQS --> Lambda
    const newImageEventSource = new events.SqsEventSource(imageProcessQueue, {
      batchSize: 5,
      maxBatchingWindow: cdk.Duration.seconds(5),
    });
    const newImageMailEventSource = new events.SqsEventSource(mailerQ, {
      batchSize: 5,
      maxBatchingWindow: cdk.Duration.seconds(5),
    });
    const failedImageMailEventSource = new events.SqsEventSource(deadLetterQueue, {
      batchSize: 5,
      maxBatchingWindow: cdk.Duration.seconds(5),
    });
    newImageTopic.addSubscription(
      new subs.SqsSubscription(imageProcessQueue)
    );
    newImageTopic.addSubscription(new subs.SqsSubscription(mailerQ));
    newImageTopic.addSubscription(new subs.SqsSubscription(deadLetterQueue));
    processImageFn.addEventSource(newImageEventSource);
    mailerFn.addEventSource(newImageMailEventSource);
    failedImageFn.addEventSource(failedImageMailEventSource);

    // Permissions

    imagesBucket.grantRead(processImageFn);
    imagesTable.grantReadData(processImageFn)

    mailerFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "ses:SendEmail",
          "ses:SendRawEmail",
          "ses:SendTemplatedEmail",
        ],
        resources: ["*"],
      })
    );

    processImageFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['dynamodb:PutItem'],
        resources: [imagesTable.tableArn],
      })
    );

    failedImageFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "ses:SendEmail",
          "ses:SendRawEmail",
          "ses:SendTemplatedEmail",
        ],
        resources: ["*"],
      })
    );
    // Output

    new cdk.CfnOutput(this, "bucketName", {
      value: imagesBucket.bucketName,
    });
  }
}
