import { getPool } from '../db';
import { notifyJobCompletion } from '../services/webhook';

/**
 * Check if all spools for a job are done processing. If so, mark the job as completed/failed.
 * A job is "completed" if at least one spool succeeded. "failed" if ALL spools failed/skipped.
 */
export async function checkAndFinalizeJob(jobId: string): Promise<void> {
  const pool = getPool();
  if (!pool) return;

  const { rows } = await pool.query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE vision_status IN ('completed', 'completed_partial', 'failed', 'skipped'))::int AS done,
       COUNT(*) FILTER (WHERE vision_status IN ('completed', 'completed_partial'))::int AS succeeded
     FROM spool s
     JOIN pdf_file pf ON pf.file_id = s.file_id
     WHERE pf.job_id = $1`,
    [jobId],
  );

  const { total, done, succeeded } = rows[0];
  if (total === 0 || done < total) return;

  const finalStatus = succeeded > 0 ? 'completed' : 'failed';

  const result = await pool.query(
    `UPDATE extraction_job
     SET status = $2,
         completed_at = NOW(),
         processed_count = $3
     WHERE job_id = $1
       AND status = 'processing'
     RETURNING webhook_url, file_count`,
    [jobId, finalStatus, done],
  );

  // Guard: if another worker already finalized this job, skip
  if ((result.rowCount ?? 0) === 0) {
    console.log(`Job ${jobId} already finalized by another worker — skipping`);
    return;
  }

  const jobRows = result.rows;
  console.log(`Job ${jobId} finalized: status=${finalStatus}, processed=${done}/${total}, succeeded=${succeeded}`);

  // Fire-and-forget webhook notification
  const webhookUrl: string | null = jobRows[0]?.webhook_url ?? null;
  const fileCount: number = jobRows[0]?.file_count ?? 0;
  notifyJobCompletion(
    webhookUrl,
    jobId,
    finalStatus,
    fileCount,
    done,
    finalStatus === 'failed' ? `All ${total} spools failed processing` : undefined,
  ).catch((err) => {
    console.error(`Webhook notification error for job ${jobId}:`, err);
  });
}
