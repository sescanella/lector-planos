import { Readable } from 'stream';

/**
 * Reads a Readable stream into a single Buffer.
 * Destroys the stream on error to prevent resource leaks.
 */
export async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  try {
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  } catch (err) {
    stream.destroy();
    throw err;
  }
}
