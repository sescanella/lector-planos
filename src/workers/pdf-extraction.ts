import { Job } from 'bullmq';
import { getPool } from '../db';
import { downloadPdf, uploadPageImage } from '../services/s3';
import { processPdf, PdfCorruptedError, PdfEmptyError, PdfTimeoutError, PdfProcessingResult } from '../services/pdf-processor';
import { addAiExtractionJob, addToDlq, ExtractionJobData } from '../services/queue';
import type { ProcessorFn } from '../services/queue';
import { streamToBuffer } from '../utils/stream';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

async function markPdfFileFailed(
  fileId: string,
  errorMessage: string,
  pageCount?: number,
  failedPages?: number,
): Promise<void> {
  const pool = getPool();
  if (!pool) throw new Error('Database not available');
  await pool.query(
    `UPDATE pdf_file
     SET status = 'failed',
         error_message = $2,
         page_count = COALESCE($3, page_count),
         failed_pages = COALESCE($4, failed_pages),
         processing_completed_at = NOW()
     WHERE file_id = $1`,
    [fileId, errorMessage, pageCount ?? null, failedPages ?? null],
  );
}

export function createPdfExtractionProcessor(): ProcessorFn {
  return async (job: Job<ExtractionJobData>): Promise<void> => {
    const { jobId, fileId, s3Key, filename } = job.data;
    const pool = getPool();
    if (!pool) throw new Error('Database not available');

    console.log(`Processing PDF: ${filename} (file: ${fileId})`);

    // Mark pdf_file as processing
    await pool.query(
      `UPDATE pdf_file SET status = 'processing', processing_started_at = NOW() WHERE file_id = $1`,
      [fileId],
    );

    // Download PDF from S3
    let pdfBuffer: Buffer;
    try {
      const stream = await downloadPdf(jobId, fileId);
      pdfBuffer = await streamToBuffer(stream);
    } catch (err) {
      await markPdfFileFailed(fileId, 'Failed to download PDF from storage.');
      throw err;
    }

    // Check file size
    if (pdfBuffer.length > MAX_FILE_SIZE) {
      await markPdfFileFailed(fileId, 'File too large. Maximum 50 MB.');
      return;
    }

    // Process PDF — extract pages
    let result: PdfProcessingResult;
    try {
      result = await processPdf(pdfBuffer);
    } catch (err) {
      if (err instanceof PdfCorruptedError) {
        await markPdfFileFailed(fileId, err.message);
        return;
      }
      if (err instanceof PdfEmptyError) {
        await markPdfFileFailed(fileId, err.message, 0);
        return;
      }
      if (err instanceof PdfTimeoutError) {
        await markPdfFileFailed(fileId, err.message);
        throw err; // Rethrow to trigger BullMQ retry
      }
      await markPdfFileFailed(fileId, 'PDF could not be processed. Please verify the file is valid.');
      return;
    }

    let succeededCount = 0;
    let uploadFailedCount = 0;
    const successfulSpools: { spoolId: string; imageS3Key: string; pageNumber: number }[] = [];

    // Process extracted pages — upload to S3 and create Spool records
    for (const page of result.pages) {
      try {
        const imageS3Key = await uploadPageImage(jobId, fileId, page.pageNumber, page.buffer, page.format);

        const { rows } = await pool.query(
          `INSERT INTO spool (file_id, page_number, image_s3_key, image_format, extraction_status)
           VALUES ($1, $2, $3, $4, 'extracted')
           RETURNING spool_id`,
          [fileId, page.pageNumber, imageS3Key, page.format],
        );

        succeededCount++;
        successfulSpools.push({
          spoolId: rows[0].spool_id,
          imageS3Key,
          pageNumber: page.pageNumber,
        });
      } catch (err) {
        console.error(`Failed to process page ${page.pageNumber} of file ${fileId}:`, (err as Error).message);
        // Create failed Spool record
        await pool.query(
          `INSERT INTO spool (file_id, page_number, extraction_status)
           VALUES ($1, $2, 'failed')`,
          [fileId, page.pageNumber],
        ).catch(dbErr => console.error(`Failed to create failed spool record:`, (dbErr as Error).message));
        uploadFailedCount++;
      }
    }

    // Create failed Spool records for pages that failed during extraction
    for (const failedPageNum of result.failedPages) {
      await pool.query(
        `INSERT INTO spool (file_id, page_number, extraction_status)
         VALUES ($1, $2, 'failed')`,
        [fileId, failedPageNum],
      ).catch(dbErr => console.error(`Failed to create failed spool record:`, (dbErr as Error).message));
    }

    const totalFailedCount = result.failedPages.length + uploadFailedCount;

    // Update pdf_file with results
    const finalStatus = succeededCount > 0 ? 'completed' : 'failed';
    const errorMsg = succeededCount === 0 ? 'No pages could be extracted from this PDF.' : null;

    await pool.query(
      `UPDATE pdf_file
       SET status = $2,
           page_count = $3,
           failed_pages = $4,
           error_message = $5,
           processing_completed_at = NOW()
       WHERE file_id = $1`,
      [fileId, finalStatus, result.totalPages, totalFailedCount, errorMsg],
    );

    // If all failed, move to DLQ
    if (succeededCount === 0) {
      await addToDlq(job.data);
      return;
    }

    // Enqueue AI extraction jobs for successful pages
    const failedEnqueues: string[] = [];
    for (const spool of successfulSpools) {
      try {
        await addAiExtractionJob({
          spoolId: spool.spoolId,
          imageS3Key: spool.imageS3Key,
          imageFormat: 'png',
          pageNumber: spool.pageNumber,
          fileId,
          jobId,
        });
        await pool.query(
          `UPDATE spool SET ai_enqueue_status = 'queued' WHERE spool_id = $1`,
          [spool.spoolId],
        );
      } catch (err) {
        console.error(`Failed to enqueue AI extraction for spool ${spool.spoolId}:`, (err instanceof Error ? err.message : String(err)));
        failedEnqueues.push(spool.spoolId);
        await pool.query(
          `UPDATE spool SET ai_enqueue_status = 'failed' WHERE spool_id = $1`,
          [spool.spoolId],
        ).catch(dbErr => console.error(`Failed to update ai_enqueue_status:`, (dbErr instanceof Error ? dbErr.message : String(dbErr))));
      }
    }
    if (failedEnqueues.length > 0) {
      console.error(`ALERT: ${failedEnqueues.length} spools failed AI enqueue for file ${fileId}: [${failedEnqueues.join(', ')}]`);
    }

    console.log(`PDF processed: ${filename} — ${succeededCount} pages extracted, ${totalFailedCount} failed`);
  };
}
