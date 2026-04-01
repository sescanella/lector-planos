import { Poppler } from 'node-poppler';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { env } from '../config/env';

// Custom error types
export class PdfCorruptedError extends Error {
  constructor(message = 'PDF could not be processed. Please verify the file is valid.') {
    super(message);
    this.name = 'PdfCorruptedError';
  }
}

export class PdfEmptyError extends Error {
  constructor(message = 'PDF contains no pages.') {
    super(message);
    this.name = 'PdfEmptyError';
  }
}

export class PdfTimeoutError extends Error {
  constructor(message = 'PDF processing timed out.') {
    super(message);
    this.name = 'PdfTimeoutError';
  }
}

export interface ExtractedPage {
  pageNumber: number;   // 1-indexed
  buffer: Buffer;       // PNG image data
  format: 'png';
}

export interface PdfProcessingResult {
  totalPages: number;
  pages: ExtractedPage[];
  failedPages: number[];  // page numbers that failed
}

const PDF_MAGIC_BYTES = '%PDF-';
const DEFAULT_TIMEOUT_MS = env.PDF_TIMEOUT_MS;
const DPI = env.PDF_DPI;
const MAX_PAGE_BUFFER_SIZE = 50 * 1024 * 1024; // 50MB max per rendered page

let popplerInstance: Poppler | null = null;
function getPoppler(): Poppler {
  if (!popplerInstance) popplerInstance = new Poppler();
  return popplerInstance;
}

/**
 * Validates a buffer contains a valid PDF by checking magic bytes.
 */
function validatePdfMagic(buffer: Buffer): void {
  const header = buffer.subarray(0, 5).toString('ascii');
  if (header !== PDF_MAGIC_BYTES) {
    throw new PdfCorruptedError();
  }
}

/**
 * Gets total page count from a PDF using pdfInfo.
 */
async function getPageCount(poppler: Poppler, pdfPath: string): Promise<number> {
  const info = await poppler.pdfInfo(pdfPath, { printAsJson: true }) as Record<string, string>;
  const pages = parseInt(info['pages'] || info['Pages'] || '0', 10);
  return pages;
}

/**
 * Extracts a single page from a PDF as a PNG buffer.
 */
async function extractSinglePage(
  poppler: Poppler,
  pdfPath: string,
  pageNumber: number,
  outputDir: string,
  signal?: AbortSignal,
): Promise<Buffer> {
  const outputPrefix = path.join(outputDir, `page`);

  await poppler.pdfToPpm(pdfPath, outputPrefix, {
    pngFile: true,
    resolutionXYAxis: DPI,
    firstPageToConvert: pageNumber,
    lastPageToConvert: pageNumber,
    singleFile: true,
  }, { signal });

  // With singleFile, output is outputPrefix.png
  const outputFile = `${outputPrefix}.png`;
  const buffer = await fs.readFile(outputFile);
  await fs.unlink(outputFile);
  if (buffer.length > MAX_PAGE_BUFFER_SIZE) {
    throw new Error(`Rendered page exceeds ${MAX_PAGE_BUFFER_SIZE / (1024 * 1024)}MB limit (${(buffer.length / (1024 * 1024)).toFixed(1)}MB)`);
  }
  return buffer;
}

/**
 * Processes a PDF buffer: validates, extracts each page as a PNG image.
 * Returns extracted pages and a list of failed page numbers.
 */
export async function processPdf(
  pdfBuffer: Buffer,
  timeout: number = DEFAULT_TIMEOUT_MS,
): Promise<PdfProcessingResult> {
  // Validate magic bytes
  validatePdfMagic(pdfBuffer);

  // Create temp directory for working files
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lector-pdf-'));

  try {
    // Write PDF to temp file (node-poppler needs a file path)
    const pdfPath = path.join(tmpDir, 'input.pdf');
    await fs.writeFile(pdfPath, pdfBuffer);

    const poppler = getPoppler();

    // Get page count
    let totalPages: number;
    try {
      totalPages = await getPageCount(poppler, pdfPath);
    } catch {
      throw new PdfCorruptedError();
    }

    if (totalPages === 0) {
      throw new PdfEmptyError();
    }

    const MAX_PAGE_COUNT = 500;
    if (totalPages > MAX_PAGE_COUNT) {
      throw new PdfCorruptedError(`PDF has ${totalPages} pages, maximum is ${MAX_PAGE_COUNT}.`);
    }

    // Set up abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const pages: ExtractedPage[] = [];
    const failedPages: number[] = [];

    try {
      // Extract pages sequentially to maintain order
      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        if (controller.signal.aborted) {
          throw new PdfTimeoutError();
        }

        try {
          const buffer = await extractSinglePage(
            poppler,
            pdfPath,
            pageNum,
            tmpDir,
            controller.signal,
          );

          pages.push({
            pageNumber: pageNum,
            buffer,
            format: 'png',
          });
        } catch (err) {
          // If timeout was triggered, propagate as timeout error
          if (controller.signal.aborted) {
            throw new PdfTimeoutError();
          }
          // Single page failure — record and continue
          console.warn(`Failed to extract page ${pageNum}: ${(err as Error).message}`);
          failedPages.push(pageNum);
        }
      }
    } finally {
      clearTimeout(timeoutId);
    }

    return { totalPages, pages, failedPages };
  } finally {
    // Clean up temp directory
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(err =>
      console.warn(`Failed to clean temp directory ${tmpDir}:`, (err as Error).message)
    );
  }
}
