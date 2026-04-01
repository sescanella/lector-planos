import { Job } from 'bullmq';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { Readable } from 'stream';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getPool } from '../db';
import { env } from '../config/env';
import { downloadByKey, getClient as getS3Client } from '../services/s3';
import { cropRegionsFromPdf } from '../services/crop';
import {
  extractFromCrops,
  VisionExtractionResult,
  VisionFatalError,
  VisionRetryableError,
} from '../services/vision';
import { deduplicateRows, deduplicateWeldRows, deduplicateCutRows } from '../services/normalizer';
import { addToAiDlq, AiExtractionJobData } from '../services/queue';
import type { AiProcessorFn } from '../services/queue';

// ── Helpers ─────────────────────────────────────────────────────────────────

async function streamToBuffer(stream: Readable): Promise<Buffer> {
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

// ── Sanity validation ───────────────────────────────────────────────────────

interface ValidationResult {
  needsReview: boolean;
  warnings: string[];
}

function sanityValidate(data: VisionExtractionResult): ValidationResult {
  const warnings: string[] = [];
  let needsReview = false;

  // Validate material rows
  if (data.materiales) {
    // Row count check
    if (Math.abs(data.materiales.totalRowsDetected - data.materiales.rows.length) > 1) {
      warnings.push(
        `Material row count mismatch: totalRowsDetected=${data.materiales.totalRowsDetected}, actual=${data.materiales.rows.length}`,
      );
    }

    // Max rows check
    if (data.materiales.rows.length > 50) {
      needsReview = true;
      warnings.push(`Excessive material rows (${data.materiales.rows.length} > 50) — possible hallucination`);
    }

    // Quantity validation
    for (const row of data.materiales.rows) {
      if (row.quantity) {
        const qty = parseFloat(row.quantity);
        if (isNaN(qty) || qty <= 0) {
          row.confidence = Math.min(row.confidence, 0.3);
          warnings.push(`Invalid quantity "${row.quantity}" for item "${row.item}"`);
        }
      }
    }

    // Deduplicate overlapping rows
    const beforeCount = data.materiales.rows.length;
    data.materiales.rows = deduplicateRows(data.materiales.rows);
    if (data.materiales.rows.length < beforeCount) {
      warnings.push(`Deduplicated ${beforeCount - data.materiales.rows.length} material rows`);
    }
  }

  // Validate and deduplicate weld rows
  if (data.soldaduras) {
    if (Math.abs(data.soldaduras.totalRowsDetected - data.soldaduras.rows.length) > 1) {
      warnings.push(
        `Weld row count mismatch: totalRowsDetected=${data.soldaduras.totalRowsDetected}, actual=${data.soldaduras.rows.length}`,
      );
    }
    if (data.soldaduras.rows.length > 30) {
      needsReview = true;
      warnings.push(`Excessive weld rows (${data.soldaduras.rows.length} > 30) — possible hallucination`);
    }
    const beforeWeldCount = data.soldaduras.rows.length;
    data.soldaduras.rows = deduplicateWeldRows(data.soldaduras.rows);
    if (data.soldaduras.rows.length < beforeWeldCount) {
      warnings.push(`Deduplicated ${beforeWeldCount - data.soldaduras.rows.length} weld rows`);
    }
  }

  // Validate and deduplicate cut rows
  if (data.cortes) {
    if (Math.abs(data.cortes.totalRowsDetected - data.cortes.rows.length) > 1) {
      warnings.push(
        `Cut row count mismatch: totalRowsDetected=${data.cortes.totalRowsDetected}, actual=${data.cortes.rows.length}`,
      );
    }
    if (data.cortes.rows.length > 30) {
      needsReview = true;
      warnings.push(`Excessive cut rows (${data.cortes.rows.length} > 30) — possible hallucination`);
    }
    const beforeCutCount = data.cortes.rows.length;
    data.cortes.rows = deduplicateCutRows(data.cortes.rows);
    if (data.cortes.rows.length < beforeCutCount) {
      warnings.push(`Deduplicated ${beforeCutCount - data.cortes.rows.length} cut rows`);
    }
  }

  // Spool number check
  if (!data.cajetin.tagSpool) {
    warnings.push('cajetin.tagSpool is empty — spool_number will be NULL');
  }

  return { needsReview, warnings };
}

// ── Status determination ────────────────────────────────────────────────────

function determineVisionStatus(
  data: VisionExtractionResult,
): 'completed' | 'completed_partial' | 'failed' | 'skipped' {
  const hasMatTable = data.materiales && data.materiales.rows.length > 0;
  const hasSoldTable = data.soldaduras && data.soldaduras.rows.length > 0;
  const hasCortesTable = data.cortes && data.cortes.rows.length > 0;
  const hasAnyTable = hasMatTable || hasSoldTable || hasCortesTable;

  // 0 tables AND cajetin confidence < 0.5 → skipped (not a spool page)
  if (!hasAnyTable && data.cajetin.confidence < 0.5) {
    return 'skipped';
  }

  // overallConfidence >= 0.6 AND at least 1 table → completed
  if (data.overallConfidence >= 0.6 && hasAnyTable) {
    return 'completed';
  }

  // overallConfidence >= 0.4 OR cajetin-only → completed_partial
  if (data.overallConfidence >= 0.4 || (!hasAnyTable && data.cajetin.confidence >= 0.5)) {
    return 'completed_partial';
  }

  // overallConfidence < 0.4 AND no tables → failed
  return 'failed';
}

// ── S3 crop upload ──────────────────────────────────────────────────────────

async function uploadCropsToS3(
  crops: Map<string, Buffer>,
  jobId: string,
  fileId: string,
  pageNumber: number,
): Promise<void> {
  const s3 = getS3Client();
  const cropKeyMap: Record<string, string> = {
    right_upper: 'crop_right_upper.png',
    right_center: 'crop_right_center.png',
    right_lower: 'crop_right_lower.png',
    cajetin_titleblk: 'crop_cajetin.png',
  };

  for (const [cropId, buffer] of crops.entries()) {
    const filename = cropKeyMap[cropId] || `crop_${cropId}.png`;
    const key = `uploads/${jobId}/${fileId}/${pageNumber}/${filename}`;
    await s3.send(new PutObjectCommand({
      Bucket: env.S3_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: 'image/png',
    }));
  }
}

// ── Main processor ──────────────────────────────────────────────────────────

export function createAiExtractionProcessor(): AiProcessorFn {
  return async (job: Job<AiExtractionJobData>): Promise<void> => {
    const { spoolId, imageS3Key, pageNumber, fileId, jobId } = job.data;
    const pool = getPool();
    if (!pool) throw new Error('Database not available');

    console.log(`AI extraction starting: spool=${spoolId}, page=${pageNumber}`);

    // Mark as processing
    await pool.query(
      `UPDATE spool SET vision_status = 'processing', vision_processing_started_at = NOW() WHERE spool_id = $1`,
      [spoolId],
    );

    // 1. Look up pdf_file.s3_key
    const { rows: fileRows } = await pool.query(
      `SELECT pf.s3_key FROM pdf_file pf JOIN spool s ON s.file_id = pf.file_id WHERE s.spool_id = $1`,
      [spoolId],
    );
    if (fileRows.length === 0) {
      throw new Error(`No pdf_file found for spool ${spoolId}`);
    }
    const pdfS3Key: string = fileRows[0].s3_key;

    // 2. Download original PDF
    let pdfBuffer: Buffer;
    try {
      const stream = await downloadByKey(pdfS3Key);
      pdfBuffer = await streamToBuffer(stream);
    } catch (err) {
      await pool.query(
        `UPDATE spool SET vision_status = 'failed', extraction_data = $2 WHERE spool_id = $1`,
        [spoolId, JSON.stringify({ error: 'Failed to download PDF from S3' })],
      );
      throw err;
    }

    // Write PDF to temp file for poppler
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lector-ai-'));
    try {
      const pdfPath = path.join(tmpDir, 'input.pdf');
      await fs.writeFile(pdfPath, pdfBuffer);

      // 3-4. Crop 4 fixed regions
      let crops: Map<string, Buffer>;
      try {
        crops = await cropRegionsFromPdf(pdfPath, pageNumber);
      } catch (err) {
        await pool.query(
          `UPDATE spool SET vision_status = 'failed', extraction_data = $2 WHERE spool_id = $1`,
          [spoolId, JSON.stringify({ error: `Crop failed: ${(err as Error).message}` })],
        );
        throw err;
      }

      // 5. Budget check
      const { rows: budgetRows } = await pool.query(
        `SELECT vision_cost_usd FROM extraction_job WHERE job_id = $1`,
        [jobId],
      );
      const currentCost = budgetRows.length > 0 ? parseFloat(budgetRows[0].vision_cost_usd) : 0;
      if (currentCost >= env.VISION_MAX_COST_PER_JOB_USD) {
        console.error(`ALERT: Budget exceeded for job ${jobId}: $${currentCost} >= $${env.VISION_MAX_COST_PER_JOB_USD}`);
        await pool.query(
          `UPDATE spool SET vision_status = 'failed', extraction_data = $2 WHERE spool_id = $1`,
          [spoolId, JSON.stringify({ error: 'budget_exceeded' })],
        );
        return; // Don't retry
      }

      // 6. Call Claude Vision API
      let result;
      try {
        result = await extractFromCrops(crops);
      } catch (err) {
        if (err instanceof VisionFatalError) {
          if (err.shouldPauseQueue) {
            console.error(`ALERT: Vision API auth failure — pausing queue. ${err.message}`);
          }
          await pool.query(
            `UPDATE spool SET vision_status = 'failed', extraction_data = $2 WHERE spool_id = $1`,
            [spoolId, JSON.stringify({ error: err.message })],
          );
          await addToAiDlq(job.data);
          return; // Fatal — don't retry
        }
        if (err instanceof VisionRetryableError) {
          // Let BullMQ retry
          throw err;
        }
        throw err;
      }

      // 7. Track cost
      await pool.query(
        `UPDATE extraction_job SET vision_cost_usd = vision_cost_usd + $2 WHERE job_id = $1`,
        [jobId, result.usage.costUsd],
      );

      // 8-9. Sanity validate
      const data = result.data;
      const { needsReview, warnings } = sanityValidate(data);
      for (const w of warnings) {
        console.warn(`[spool=${spoolId}] ${w}`);
      }

      if (needsReview) {
        (data as VisionExtractionResult & { needs_review?: boolean }).needs_review = true;
      }

      // Determine status
      const visionStatus = determineVisionStatus(data);

      // 10. Single DB transaction for all writes
      const dbClient = await pool.connect();
      try {
        await dbClient.query('BEGIN');

        // 10a. Update spool
        await dbClient.query(
          `UPDATE spool
           SET vision_status = $2,
               confidence_score = $3,
               extraction_data = $4,
               drawing_format = $5,
               spool_number = COALESCE($6, spool_number)
           WHERE spool_id = $1`,
          [
            spoolId,
            visionStatus,
            data.overallConfidence,
            JSON.stringify({
              materiales: data.materiales,
              soldaduras: data.soldaduras,
              cortes: data.cortes,
              cajetin: data.cajetin,
            }),
            JSON.stringify(data.drawingFormat),
            data.cajetin.tagSpool || null,
          ],
        );

        // 10b. Upsert spool_metadata
        const metadataRaw = {
          ot: data.cajetin.ot,
          of: data.cajetin.of,
          tagSpool: data.cajetin.tagSpool,
          diameter: data.cajetin.diameter,
          client: data.cajetin.client,
          endClient: data.cajetin.endClient,
          line: data.cajetin.line,
          revision: data.cajetin.revision,
        };
        await dbClient.query(
          `INSERT INTO spool_metadata (spool_id, raw_data, confidence_score)
           VALUES ($1, $2, $3)
           ON CONFLICT (spool_id) DO UPDATE
           SET raw_data = EXCLUDED.raw_data,
               confidence_score = EXCLUDED.confidence_score`,
          [spoolId, JSON.stringify(metadataRaw), data.cajetin.confidence],
        );

        // 10c. Delete + insert material rows (idempotent)
        await dbClient.query('DELETE FROM material WHERE spool_id = $1', [spoolId]);
        if (data.materiales && data.materiales.rows.length > 0) {
          for (const row of data.materiales.rows) {
            const { confidence, ...rawFields } = row;
            await dbClient.query(
              `INSERT INTO material (spool_id, raw_data, confidence_score) VALUES ($1, $2, $3)`,
              [spoolId, JSON.stringify(rawFields), confidence],
            );
          }
        }

        // 10d. Delete + insert spool_union rows (welds)
        await dbClient.query('DELETE FROM spool_union WHERE spool_id = $1', [spoolId]);
        if (data.soldaduras && data.soldaduras.rows.length > 0) {
          for (const row of data.soldaduras.rows) {
            const { confidence, ...rawFields } = row;
            await dbClient.query(
              `INSERT INTO spool_union (spool_id, raw_data, confidence_score) VALUES ($1, $2, $3)`,
              [spoolId, JSON.stringify(rawFields), confidence],
            );
          }
        }

        // 10e. Delete + insert cut rows
        await dbClient.query('DELETE FROM cut WHERE spool_id = $1', [spoolId]);
        if (data.cortes && data.cortes.rows.length > 0) {
          for (const row of data.cortes.rows) {
            const { confidence, ...rawFields } = row;
            await dbClient.query(
              `INSERT INTO cut (spool_id, raw_data, confidence_score) VALUES ($1, $2, $3)`,
              [spoolId, JSON.stringify(rawFields), confidence],
            );
          }
        }

        await dbClient.query('COMMIT');
      } catch (err) {
        await dbClient.query('ROLLBACK');
        throw err;
      } finally {
        dbClient.release();
      }

      // 11. Upload crop images to S3 for audit trail (non-blocking)
      try {
        await uploadCropsToS3(crops, jobId, fileId, pageNumber);
      } catch (err) {
        console.warn(`Failed to upload crop images for spool ${spoolId}:`, (err as Error).message);
      }

      console.log(
        `AI extraction ${visionStatus}: spool=${spoolId}, confidence=${data.overallConfidence.toFixed(2)}, ` +
        `materials=${data.materiales?.rows.length ?? 0}, welds=${data.soldaduras?.rows.length ?? 0}, ` +
        `cuts=${data.cortes?.rows.length ?? 0}, cost=$${result.usage.costUsd.toFixed(4)}`,
      );

    } finally {
      // 12. Clean up temp files
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(err =>
        console.warn(`Failed to clean temp directory ${tmpDir}:`, (err as Error).message),
      );
    }
  };
}
