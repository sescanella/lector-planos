import { createHmac } from 'crypto';
import { resolve4, resolve6 } from 'dns/promises';
import { env } from '../config/env';

const RETRY_DELAYS = [1000, 5000, 30000]; // 1s, 5s, 30s
const TIMEOUT = 10000; // 10 seconds
const BLOCKED_HOSTS = /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|\[::1\]|0\.0\.0\.0)$/i;

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

function signPayload(body: string, timestamp: number): string {
  const hmac = createHmac('sha256', env.WEBHOOK_HMAC_SECRET);
  hmac.update(`${timestamp}.${body}`);
  return 'sha256=' + hmac.digest('hex');
}

// --- SSRF protection ---

function isBlockedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^\[|\]$/g, '');
    if (BLOCKED_HOSTS.test(host)) return true;
    // Block IPv6 private ranges: fc00::/7 (includes fd00::/8), fe80::/10
    if (/^[fF][cdCD]/i.test(host) || /^[fF][eE][89aAbB]/i.test(host)) return true;
    return parsed.protocol !== 'https:';
  } catch {
    return true;
  }
}

/**
 * Validates a webhook URL for safety (HTTPS-only, no private/metadata hosts).
 * Used by REQ-11 notifyJobCompletion for allowlist checks.
 */
export function isAllowedWebhookUrl(urlString: string): boolean {
  return !isBlockedUrl(urlString);
}

const PRIVATE_IP_PATTERNS = [
  /^127\./, /^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^169\.254\./, /^0\./,
];

function isPrivateIp(ip: string): boolean {
  return PRIVATE_IP_PATTERNS.some(p => p.test(ip));
}

function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  return lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe8');
}

async function hasPrivateResolution(hostname: string): Promise<boolean> {
  try {
    const ipv4s = await resolve4(hostname).catch(() => []);
    if (ipv4s.some(isPrivateIp)) return true;
    const ipv6s = await resolve6(hostname).catch(() => []);
    if (ipv6s.some(isPrivateIpv6)) return true;
    return false;
  } catch {
    return true; // Fail closed: unresolvable hosts are blocked
  }
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

  if (isBlockedUrl(webhookUrl)) {
    console.warn(`Webhook blocked: URL targets private/non-HTTPS host: ${sanitizeUrl(webhookUrl)}`);
    return false;
  }

  // DNS rebinding protection: resolve hostname and verify IPs are public
  const hostname = new URL(webhookUrl).hostname;
  if (await hasPrivateResolution(hostname)) {
    console.warn(`Webhook blocked: DNS resolves to private IP: ${sanitizeUrl(webhookUrl)}`);
    return false;
  }

  const safeUrl = sanitizeUrl(webhookUrl);
  const body = JSON.stringify(payload);
  const jobId = getPayloadJobId(payload);

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      // Fresh timestamp+signature per attempt for replay protection
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = signPayload(body, timestamp);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT);

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Timestamp': String(timestamp),
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

  if (!isAllowedWebhookUrl(webhookUrl)) {
    console.warn(`Blocked webhook to disallowed URL: ${webhookUrl}`);
    return;
  }

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
