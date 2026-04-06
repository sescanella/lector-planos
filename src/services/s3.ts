import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Upload } from '@aws-sdk/lib-storage';
import { Readable } from 'stream';
import { env } from '../config/env';

let client: S3Client | null = null;

export function getClient(): S3Client {
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

  // Use multipart upload for files > 5MB (AWS best practice)
  if (sizeBytes > 5 * 1024 * 1024) {
    const upload = new Upload({
      client: s3,
      params: {
        Bucket: env.S3_BUCKET_NAME,
        Key: key,
        Body: body,
        ContentType: 'application/pdf',
        ServerSideEncryption: 'AES256',
      },
    });
    await upload.done();
  } else {
    await s3.send(new PutObjectCommand({
      Bucket: env.S3_BUCKET_NAME,
      Key: key,
      Body: body,
      ContentType: 'application/pdf',
      ServerSideEncryption: 'AES256',
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

  if (!response.Body) {
    throw new Error(`S3 object not found: ${key}`);
  }

  console.log(`S3 download: ${key}`);
  return response.Body as Readable;
}

export async function downloadByKey(s3Key: string): Promise<Readable> {
  const s3 = getClient();
  const response = await s3.send(new GetObjectCommand({
    Bucket: env.S3_BUCKET_NAME,
    Key: s3Key,
  }));
  if (!response.Body) {
    throw new Error(`S3 object not found: ${s3Key}`);
  }
  console.log(`S3 download by key: ${s3Key}`);
  return response.Body as Readable;
}

export async function checkS3Connection(): Promise<boolean> {
  if (!env.S3_BUCKET_NAME) return false;
  try {
    const s3 = getClient();
    await s3.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET_NAME }));
    return true;
  } catch {
    return false;
  }
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

function buildPageImageKey(jobId: string, fileId: string, pageNumber: number, format: 'png' | 'jpeg'): string {
  return `uploads/${jobId}/${fileId}/${pageNumber}.${format}`;
}

const CONTENT_TYPES: Record<'png' | 'jpeg', string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
};

export async function uploadPageImage(
  jobId: string,
  fileId: string,
  pageNumber: number,
  imageBuffer: Buffer,
  format: 'png' | 'jpeg'
): Promise<string> {
  const key = buildPageImageKey(jobId, fileId, pageNumber, format);
  const s3 = getClient();
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await s3.send(new PutObjectCommand({
        Bucket: env.S3_BUCKET_NAME,
        Key: key,
        Body: imageBuffer,
        ContentType: CONTENT_TYPES[format],
        ServerSideEncryption: 'AES256',
      }));
      console.log(`S3 upload page image: ${key} (${imageBuffer.length} bytes)`);
      return key;
    } catch (err) {
      if (attempt === maxAttempts) {
        console.error(`S3 upload failed after ${maxAttempts} attempts: ${key}`);
        throw err;
      }
      const delay = 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s
      console.warn(`S3 upload attempt ${attempt} failed for ${key}, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // Unreachable: loop above always returns on success or throws on final attempt
  return undefined as never;
}

export async function getPresignedUrl(s3Key: string): Promise<string> {
  const s3 = getClient();
  const url = await getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: env.S3_BUCKET_NAME,
      Key: s3Key,
    }),
    { expiresIn: 3600 } // 1 hour
  );
  return url;
}

export async function uploadExcel(
  exportId: string,
  filePath: string
): Promise<{ s3Key: string; fileSizeBytes: number }> {
  const { readFile, stat } = await import('fs/promises');
  const s3Key = `exports/${exportId}.xlsx`;
  const s3 = getClient();

  const fileStat = await stat(filePath);
  const fileSizeBytes = fileStat.size;

  if (fileSizeBytes > 5 * 1024 * 1024) {
    const { createReadStream } = await import('fs');
    const stream = createReadStream(filePath);
    const upload = new Upload({
      client: s3,
      params: {
        Bucket: env.S3_BUCKET_NAME,
        Key: s3Key,
        Body: stream,
        ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ServerSideEncryption: 'AES256',
      },
    });
    await upload.done();
  } else {
    const fileBuffer = await readFile(filePath);
    await s3.send(new PutObjectCommand({
      Bucket: env.S3_BUCKET_NAME,
      Key: s3Key,
      Body: fileBuffer,
      ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ServerSideEncryption: 'AES256',
    }));
  }

  console.log(`S3 upload excel: ${s3Key} (${fileSizeBytes} bytes)`);
  return { s3Key, fileSizeBytes };
}

export async function getExportPresignedUrl(
  s3Key: string,
  filename: string
): Promise<string> {
  const s3 = getClient();
  // Filename is expected to be pre-sanitized by the caller (export.ts).
  // Use RFC 5987 encoding for UTF-8 filenames (supports accented characters).
  const encodedFilename = encodeURIComponent(filename).replace(/'/g, '%27');
  const url = await getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: env.S3_BUCKET_NAME,
      Key: s3Key,
      ResponseContentDisposition: `attachment; filename="${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}"; filename*=UTF-8''${encodedFilename}`,
    }),
    { expiresIn: env.EXPORT_PRESIGNED_EXPIRY_SECS }
  );
  return url;
}
