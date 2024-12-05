/* eslint-disable import/extensions, import/no-absolute-path */
import { SQSHandler } from "aws-lambda";
import {
  GetObjectCommand,
  PutObjectCommandInput,
  GetObjectCommandInput,
  S3Client,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

import { DynamoDB } from 'aws-sdk';

const dynamoDb = new DynamoDB.DocumentClient();
const s3 = new S3Client();

export const handler: SQSHandler = async (event) => {
  console.log("Event ", JSON.stringify(event));
  for (const record of event.Records) {
    const recordBody = JSON.parse(record.body);
    const snsMessage = JSON.parse(recordBody.Message);

    if (snsMessage.Records) {
      console.log("Record body ", JSON.stringify(snsMessage));
      for (const messageRecord of snsMessage.Records) {
        const s3e = messageRecord.s3;    
        const fileName = decodeURIComponent(s3e.object.key.replace(/\+/g, ' '));
        const srcBucket = s3e.bucket.name;

        const srcKey = decodeURIComponent(s3e.object.key.replace(/\+/g, " "));

        const fileType = srcKey.split(".").pop()?.toLowerCase();
        const fileTypes = [".png", ".jpeg"];
      
        const imageParams = {
          TableName: process.env.TABLE_NAME!,
          Item: {
            fileName,
            timestamp: new Date().toISOString(),
            srcBucket,
          },
        };

        let origimage = null;
        try {
          if(!fileTypes.includes(`.${fileType}`)) {
            console.log(`Invalid file type: ${fileType}`);
            throw new Error(`Unsupported file type: ${fileType}`);
          }
          const params: GetObjectCommandInput = {
            Bucket: srcBucket,
            Key: srcKey,
          };
          origimage = await s3.send(new GetObjectCommand(params));
          await dynamoDb.put(imageParams).promise();
        } catch (error) {
          console.log(error);
          throw new Error(`Unsupported file type2: ${fileType}`);
        }
      }
    }
  }
};