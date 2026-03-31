const RETRY_DELAYS = [1000, 5000, 30000]; // 1s, 5s, 30s
const TIMEOUT = 10000; // 10 seconds

interface WebhookPayload {
  job_id: string;
  status: string;
  file_count: number;
  processed_count: number;
  error_message?: string;
}

export async function sendWebhook(
  webhookUrl: string,
  payload: WebhookPayload
): Promise<boolean> {
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
        console.log(`Webhook delivered: ${webhookUrl} (job: ${payload.job_id}, attempt: ${attempt + 1})`);
        return true;
      }

      console.warn(`Webhook failed: ${webhookUrl} (status: ${response.status}, attempt: ${attempt + 1})`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.warn(`Webhook error: ${webhookUrl} (${message}, attempt: ${attempt + 1})`);
    }

    // Wait before retry (skip delay on last attempt)
    if (attempt < RETRY_DELAYS.length) {
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[attempt]));
    }
  }

  console.error(`Webhook delivery failed after ${RETRY_DELAYS.length + 1} attempts: ${webhookUrl} (job: ${payload.job_id})`);
  return false;
}

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
