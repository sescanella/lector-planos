const RETRY_DELAYS = [1000, 5000, 30000]; // 1s, 5s, 30s
const TIMEOUT = 10000; // 10 seconds

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

  await sendWebhook(webhookUrl, {
    job_id: jobId,
    status,
    file_count: fileCount,
    processed_count: processedCount,
    error_message: errorMessage,
  });
}
