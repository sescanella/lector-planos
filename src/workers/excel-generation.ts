import { Job } from 'bullmq';
import * as os from 'os';
import * as path from 'path';
import { unlink } from 'fs/promises';
import { getPool } from '../db';
import { buildExcelWorkbook, SpoolExportData } from '../services/excel-builder';
import { uploadExcel } from '../services/s3';
import { notifyExportCompletion, notifyExportFailure } from '../services/webhook';
import { env } from '../config/env';
import type { ExcelGenerationJobData } from '../services/queue';

async function updateExportStatus(
  exportId: string,
  status: 'processing' | 'completed' | 'failed',
  extra: Record<string, any> = {}
): Promise<void> {
  const pool = getPool();
  if (!pool) throw new Error('Database not available');

  const sets = ['status = $2'];
  const values: any[] = [exportId, status];
  let idx = 3;

  if (extra.s3Key !== undefined) {
    sets.push(`s3_key = $${idx}`);
    values.push(extra.s3Key);
    idx++;
  }
  if (extra.fileSizeBytes !== undefined) {
    sets.push(`file_size_bytes = $${idx}`);
    values.push(extra.fileSizeBytes);
    idx++;
  }
  if (extra.spoolCount !== undefined) {
    sets.push(`spool_count = $${idx}`);
    values.push(extra.spoolCount);
    idx++;
  }
  if (extra.errorMessage !== undefined) {
    sets.push(`error_message = $${idx}`);
    values.push(extra.errorMessage.substring(0, 1000));
    idx++;
  }
  if (status === 'completed') {
    sets.push(`completed_at = NOW()`);
    sets.push(`expires_at = NOW() + INTERVAL '${env.EXCEL_EXPORT_EXPIRY_DAYS} days'`);
  }

  await pool.query(
    `UPDATE excel_export SET ${sets.join(', ')} WHERE export_id = $1`,
    values
  );
}

async function querySpoolsForJob(jobId: string): Promise<SpoolExportData[]> {
  const pool = getPool();
  if (!pool) throw new Error('Database not available');

  // Get all completed spools for the job
  const { rows: spoolRows } = await pool.query(
    `SELECT s.spool_id, s.spool_number, s.confidence_score
     FROM spool s
     JOIN pdf_file f ON f.file_id = s.file_id
     WHERE f.job_id = $1 AND s.extraction_status = 'extracted'
     ORDER BY s.spool_number ASC`,
    [jobId]
  );

  const spools: SpoolExportData[] = [];

  for (const row of spoolRows) {
    const spoolId = row.spool_id;

    // Query all child tables in parallel
    const [materialsRes, weldsRes, cutsRes, metadataRes] = await Promise.all([
      pool.query('SELECT raw_data, confidence_score FROM material WHERE spool_id = $1', [spoolId]),
      pool.query('SELECT raw_data, confidence_score FROM spool_union WHERE spool_id = $1', [spoolId]),
      pool.query('SELECT raw_data, confidence_score FROM cut WHERE spool_id = $1', [spoolId]),
      pool.query('SELECT raw_data, confidence_score FROM spool_metadata WHERE spool_id = $1 LIMIT 1', [spoolId]),
    ]);

    const metadata = metadataRes.rows.length > 0
      ? { rawData: metadataRes.rows[0].raw_data, confidenceScore: metadataRes.rows[0].confidence_score }
      : null;

    spools.push({
      spoolNumber: row.spool_number || 'Sin-Nombre',
      confidenceScore: row.confidence_score ?? 0,
      metadata,
      materials: materialsRes.rows.map(r => ({ rawData: r.raw_data, confidenceScore: r.confidence_score })),
      welds: weldsRes.rows.map(r => ({ rawData: r.raw_data, confidenceScore: r.confidence_score })),
      cuts: cutsRes.rows.map(r => ({ rawData: r.raw_data, confidenceScore: r.confidence_score })),
    });
  }

  return spools;
}

async function getWebhookUrl(jobId: string): Promise<string | null> {
  const pool = getPool();
  if (!pool) return null;
  const { rows } = await pool.query('SELECT webhook_url FROM extraction_job WHERE job_id = $1', [jobId]);
  return rows[0]?.webhook_url ?? null;
}

async function getExportCreatedAt(exportId: string): Promise<string> {
  const pool = getPool();
  if (!pool) return new Date().toISOString();
  const { rows } = await pool.query('SELECT created_at FROM excel_export WHERE export_id = $1', [exportId]);
  return rows[0]?.created_at?.toISOString?.() ?? new Date().toISOString();
}

export function createExcelGenerationProcessor(): (job: Job<ExcelGenerationJobData>) => Promise<void> {
  return async (job) => {
    const { exportId, jobId, includeConfidence } = job.data;
    const tempPath = path.join(os.tmpdir(), `export-${exportId}.xlsx`);

    try {
      // Step 1: Set status to processing (handles crash recovery — AC-37)
      await updateExportStatus(exportId, 'processing');

      // Step 2-3: Query spools and their child data
      const spools = await querySpoolsForJob(jobId);

      // Step 4-5: Build Excel workbook to temp file
      await buildExcelWorkbook(spools, { includeConfidence, jobId }, tempPath);

      // Step 6: Upload to S3
      const { s3Key, fileSizeBytes } = await uploadExcel(exportId, tempPath);

      // Step 7: Update DB as completed
      await updateExportStatus(exportId, 'completed', {
        s3Key,
        fileSizeBytes,
        spoolCount: spools.length,
      });

      // Step 8: Delete temp file
      await safeDeleteTempFile(tempPath);

      // Step 9: Fire webhook
      const webhookUrl = await getWebhookUrl(jobId);
      const createdAt = await getExportCreatedAt(exportId);
      await notifyExportCompletion(webhookUrl, {
        export_id: exportId,
        job_id: jobId,
        spool_count: spools.length,
        file_size_bytes: fileSizeBytes,
        created_at: createdAt,
        completed_at: new Date().toISOString(),
      });

      console.log(`Excel export completed: ${exportId} (${spools.length} spools, ${fileSizeBytes} bytes)`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error(`Excel export failed: ${exportId} — ${errorMessage}`);

      // Update DB as failed
      try {
        await updateExportStatus(exportId, 'failed', { errorMessage });
      } catch (dbErr) {
        console.error(`Failed to update export status: ${exportId}`, dbErr);
      }

      // Delete temp file
      await safeDeleteTempFile(tempPath);

      // Fire failure webhook
      try {
        const webhookUrl = await getWebhookUrl(jobId);
        const createdAt = await getExportCreatedAt(exportId);
        await notifyExportFailure(webhookUrl, {
          export_id: exportId,
          job_id: jobId,
          error_message: errorMessage.substring(0, 1000),
          created_at: createdAt,
        });
      } catch (webhookErr) {
        console.error(`Failed to send failure webhook: ${exportId}`, webhookErr);
      }

      throw err; // Re-throw for BullMQ retry
    }
  };
}

async function safeDeleteTempFile(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch {
    // File may not exist — ignore
  }
}
