import { S3Client } from '@aws-sdk/client-s3';
import env from './env.js';

let client = null;

/**
 * Lazily creates (and memoizes) the S3 client pointed at Cloudflare R2.
 * R2 is S3-API compatible, so the standard AWS SDK works against it -
 * we just point `endpoint` at the R2 account endpoint and use R2's keys.
 */
export const getR2Client = () => {
  if (client) return client;

  if (env.storage.driver !== 'r2') {
    throw new Error('getR2Client() called but STORAGE_DRIVER is not "r2"');
  }

const { accessKeyId, secretAccessKey, endpoint, bucket } = env.storage.r2;

console.log("========== R2 CONFIG ==========");
console.log("Driver:", env.storage.driver);
console.log("Bucket:", bucket);
console.log("Endpoint:", endpoint);
console.log("Access Key Exists:", !!accessKeyId);
console.log("Secret Exists:", !!secretAccessKey);
console.log("===============================");

client = new S3Client({
    region: "auto",
    endpoint,
    credentials: {
        accessKeyId,
        secretAccessKey,
    },
});

  return client;
};

export default getR2Client;
