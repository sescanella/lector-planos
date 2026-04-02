import { Readable } from 'stream';

const DEFAULT_MAX_BYTES = 200 * 1024 * 1024; // 200 MB

/**
 * Reads a Readable stream into a single Buffer.
 * Destroys the stream on error or if maxBytes is exceeded to prevent resource leaks.
 */
export async function streamToBuffer(
  stream: Readable,
  maxBytes: number = DEFAULT_MAX_BYTES,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let totalSize = 0;
  try {
    for await (const chunk of stream) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalSize += buf.length;
      if (totalSize > maxBytes) {
        stream.destroy();
        throw new Error(`Stream exceeds maximum size of ${Math.round(maxBytes / (1024 * 1024))}MB`);
      }
      chunks.push(buf);
    }
    return Buffer.concat(chunks);
  } catch (err) {
    stream.destroy();
    throw err;
  }
}
