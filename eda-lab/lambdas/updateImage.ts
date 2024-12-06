import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { SNSHandler } from "aws-lambda";
import { SQSHandler } from "aws-lambda";

const TABLE_NAME = process.env.TABLE_NAME;

export const handler: SQSHandler = async (event) => {
  console.log("Received Event: ", JSON.stringify(event));

  for (const record of event.Records) {
    const snsMessage = JSON.parse(record.body);
    const attributes = record.messageAttributes;

    const fileName = snsMessage.fileName;
    const value = snsMessage.value;
    const metadataType = attributes.metadata_type?.stringValue;

    if (!fileName) {
      console.error("missing primary key");
      continue;
    }

    try {
      const command = new UpdateCommand({
        TableName: process.env.TABLE_NAME,
        Key: { fileName },
        UpdateExpression:
          "SET #value = :value, #metadataType = :metadataType, #timestamp = :timestamp",
        ExpressionAttributeNames: {
          "#value": "value",
          "#metadataType": "metadataType",
          "#timestamp": "timestamp",
        },
        ExpressionAttributeValues: {
          ":value": value || "NoValueProvided",
          ":metadataType": metadataType || "Unknown",
          ":timestamp": new Date().toISOString(),
        },
        ReturnValues: "ALL_NEW",
      });
      const result = await dynamoClient.send(command);
      console.log("DynamoDB updated:", JSON.stringify(result));

    } catch (error) {
      console.error("Failed to update item in DynamoDB:", error);
    }
  }
};