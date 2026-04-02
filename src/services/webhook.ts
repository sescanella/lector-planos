import { createHmac } from 'crypto';
import { env } from '../config/env.js';

const RETRY_DELAYS = [1000, 5000, 30000]; // 1s, 5s, 30s
const TIMEOUT = 10000; // 10 seconds

// --- Payload types ---

interface JobWebhookPayload {
  job_id: string;
  status: string;
  file_count: number;
  processed_count: number;
  error_message?: string;
}

export interface ExportReadyPayload {
  event: 'export.ready';
  export_id: string;
  job_id: string;
  status: 'completed';
  spool_count: number;
  file_size_bytes: number;
  created_at: string;
  completed_at: string;
}

export interface ExportFailedPayload {
  event: 'export.failed';
  export_id: string;
  job_id: string;
  status: 'failed';
  error_message: string;
  created_at: string;
}

type WebhookPayload = JobWebhookPayload | ExportReadyPayload | ExportFailedPayload;

// --- HMAC signing ---

function signPayload(body: string): string {
  const hmac = createHmac('sha256', env.WEBHOOK_HMAC_SECRET);
  hmac.update(body);
  return 'sha256=' + hmac.digest('hex');
}

// --- Helpers ---

function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return '[invalid-url]';
  }
}

function getPayloadJobId(payload: WebhookPayload): string {
  return payload.job_id;
}

// --- Core send ---

export async function sendWebhook(
  webhookUrl: string,
  payload: WebhookPayload
): Promise<boolean> {
  if (!env.WEBHOOK_HMAC_SECRET) {
    console.log('Webhook notification skipped (WEBHOOK_HMAC_SECRET not configured)');
    return false;
  }

  const safeUrl = sanitizeUrl(webhookUrl);
  const body = JSON.stringify(payload);
  const signature = signPayload(body);
  const jobId = getPayloadJobId(payload);

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT);

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
        },
        body,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.ok) {
        console.log(`Webhook delivered: ${safeUrl} (job: ${jobId}, attempt: ${attempt + 1})`);
        return true;
      }

      console.warn(`Webhook failed: ${safeUrl} (status: ${response.status}, attempt: ${attempt + 1})`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.warn(`Webhook error: ${safeUrl} (${message}, attempt: ${attempt + 1})`);
    }

    if (attempt < RETRY_DELAYS.length) {
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[attempt]));
    }
  }

  console.error(`Webhook delivery failed after ${RETRY_DELAYS.length + 1} attempts: ${safeUrl} (job: ${jobId})`);
  return false;
}

// --- Public notification helpers ---

export async function notifyJobCompletion(
  webhookUrl: string | null,
  jobId: string,
  status: string,
  fileCount: number,
  processedCount: number,
  errorMessage?: string
): Promise<void> {
  if (!webhookUrl) return;

  await sendWebhook(webhookUrl, {
    job_id: jobId,
    status,
    file_count: fileCount,
    processed_count: processedCount,
    error_message: errorMessage,
  });
}

export async function notifyExportCompletion(
  webhookUrl: string | null,
  data: Omit<ExportReadyPayload, 'event' | 'status'>
): Promise<void> {
  if (!webhookUrl) return;

  await sendWebhook(webhookUrl, {
    event: 'export.ready',
    status: 'completed',
    ...data,
  });
}

export async function notifyExportFailure(
  webhookUrl: string | null,
  data: Omit<ExportFailedPayload, 'event' | 'status'>
): Promise<void> {
  if (!webhookUrl) return;

  await sendWebhook(webhookUrl, {
    event: 'export.failed',
    status: 'failed',
    ...data,
  });
}
