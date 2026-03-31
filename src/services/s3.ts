import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { Readable } from 'stream';
import { env } from '../config/env';

let client: S3Client | null = null;

function getClient(): S3Client {
  if (!client) {
    client = new S3Client({ region: env.AWS_REGION });
  }
  return client;
}

function buildKey(jobId: string, fileId: string): string {
  return `uploads/${jobId}/${fileId}.pdf`;
}

export async function uploadPdf(
  jobId: string,
  fileId: string,
  body: Buffer | Readable,
  sizeBytes: number
): Promise<string> {
  const key = buildKey(jobId, fileId);
  const s3 = getClient();

  // Use multipart upload for files > 100MB
  if (sizeBytes > 100 * 1024 * 1024) {
    const upload = new Upload({
      client: s3,
      params: {
        Bucket: env.S3_BUCKET_NAME,
        Key: key,
        Body: body,
        ContentType: 'application/pdf',
      },
    });
    await upload.done();
  } else {
    await s3.send(new PutObjectCommand({
      Bucket: env.S3_BUCKET_NAME,
      Key: key,
      Body: body,
      ContentType: 'application/pdf',
    }));
  }

  console.log(`S3 upload: ${key} (${sizeBytes} bytes)`);
  return key;
}

export async function downloadPdf(
  jobId: string,
  fileId: string
): Promise<Readable> {
  const key = buildKey(jobId, fileId);
  const s3 = getClient();

  const response = await s3.send(new GetObjectCommand({
    Bucket: env.S3_BUCKET_NAME,
    Key: key,
  }));

  console.log(`S3 download: ${key}`);
  return response.Body as Readable;
}

export async function deletePdf(
  jobId: string,
  fileId: string
): Promise<void> {
  const key = buildKey(jobId, fileId);
  const s3 = getClient();

  await s3.send(new DeleteObjectCommand({
    Bucket: env.S3_BUCKET_NAME,
    Key: key,
  }));

  console.log(`S3 delete: ${key}`);
}
