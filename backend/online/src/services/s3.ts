import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config.js';
import { AppError } from '../middleware/error.js';

let client: S3Client | null = null;

function storage() {
  const { region, accessKeyId, secretAccessKey, bucket, endpoint, forcePathStyle } = config.s3;
  if (!region || !accessKeyId || !secretAccessKey || !bucket) {
    throw new AppError(503, 'File storage is not configured', 'storage_unavailable');
  }
  if (!client) {
    client = new S3Client({
      region,
      credentials: { accessKeyId, secretAccessKey },
      ...(endpoint ? { endpoint, forcePathStyle } : {}),
    });
  }
  return { client, bucket };
}

export async function uploadObject(input: {
  key: string;
  body: Buffer | Uint8Array;
  contentType: string;
}) {
  const { client: s3, bucket } = storage();
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType,
    }),
  );
  return input.key;
}

export async function presignedGetUrl(key: string, expiresInSeconds = 900) {
  const { client: s3, bucket } = storage();
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn: expiresInSeconds,
  });
}

export async function deleteObject(key: string) {
  const { client: s3, bucket } = storage();
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
