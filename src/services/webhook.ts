const RETRY_DELAYS = [1000, 5000, 30000]; // 1s, 5s, 30s
const TIMEOUT = 10000; // 10 seconds

const BLOCKED_HOSTS = [
  '127.0.0.1', 'localhost', '0.0.0.0', '::1',
  '169.254.169.254', // AWS metadata
  'metadata.google.internal', // GCP metadata
];

function isAllowedWebhookUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);

    // Must be HTTPS
    if (url.protocol !== 'https:') return false;

    // Block known internal/metadata hosts
    if (BLOCKED_HOSTS.includes(url.hostname)) return false;

    // Block private IP ranges
    const parts = url.hostname.split('.').map(Number);
    if (parts.length === 4 && parts.every(n => !isNaN(n))) {
      if (parts[0] === 10) return false; // 10.x.x.x
      if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return false; // 172.16-31.x.x
      if (parts[0] === 192 && parts[1] === 168) return false; // 192.168.x.x
    }

    return true;
  } catch {
    return false;
  }
}

interface WebhookPayload {
  job_id: string;
  status: string;
  file_count: number;
  processed_count: number;
  error_message?: string;
}

function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return '[invalid-url]';
  }
}

export async function sendWebhook(
  webhookUrl: string,
  payload: WebhookPayload
): Promise<boolean> {
  // TODO: Webhooks disabled until allowlist is implemented
  console.log('Webhook notification skipped (webhooks not yet enabled)');
  return false;

  /* Dead code — retry logic preserved for when webhooks are re-enabled
  const safeUrl = sanitizeUrl(webhookUrl);

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT);

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.ok) {
        console.log(`Webhook delivered: ${safeUrl} (job: ${payload.job_id}, attempt: ${attempt + 1})`);
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

  console.error(`Webhook delivery failed after ${RETRY_DELAYS.length + 1} attempts: ${safeUrl} (job: ${payload.job_id})`);
  return false;
  */
}

// Note: called by the extraction worker when job processing completes (REQ-10/11)
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
