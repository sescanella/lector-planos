import { Poppler } from 'node-poppler';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { env } from '../config/env';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CropRegion {
  id: string;
  leftPct: number;   // 0-100
  topPct: number;    // 0-100
  rightPct: number;  // 0-100
  bottomPct: number; // 0-100
  dpi: number;
}

export interface PageDimensions {
  widthPts: number;
  heightPts: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Four fixed crop regions validated in Experiment 3.
 * 20% overlap between table crops prevents items lost at boundaries.
 */
export const FIXED_CROPS: readonly CropRegion[] = [
  { id: 'right_upper',     leftPct: 45, topPct:  0, rightPct: 100, bottomPct: 40, dpi: 600 },
  { id: 'right_center',    leftPct: 45, topPct: 20, rightPct: 100, bottomPct: 60, dpi: 600 },
  { id: 'right_lower',     leftPct: 45, topPct: 45, rightPct: 100, bottomPct: 82, dpi: 600 },
  { id: 'cajetin_titleblk', leftPct: 50, topPct: 80, rightPct: 100, bottomPct: 100, dpi: 800 },
] as const;

const MAX_PIXEL_DIM = 8000;
const MAX_CROP_BUFFER_SIZE = 200 * 1024 * 1024; // 200 MB
const CROP_TIMEOUT_MS = env.PDF_TIMEOUT_MS; // reuse existing env var

// ---------------------------------------------------------------------------
// Poppler singleton (matches pdf-processor.ts pattern)
// ---------------------------------------------------------------------------

let popplerInstance: Poppler | null = null;
function getPoppler(): Poppler {
  if (!popplerInstance) popplerInstance = new Poppler();
  return popplerInstance;
}

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export class CropTimeoutError extends Error {
  constructor(message = 'Crop processing timed out.') {
    super(message);
    this.name = 'CropTimeoutError';
  }
}

export class CropDimensionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CropDimensionError';
  }
}

// ---------------------------------------------------------------------------
// Page dimensions
// ---------------------------------------------------------------------------

/**
 * Gets page dimensions in points from a PDF using poppler.pdfInfo().
 * Parses the "Page size" field which has format "595.276 x 841.89 pts".
 */
export async function getPageDimensions(pdfPath: string): Promise<PageDimensions> {
  const poppler = getPoppler();
  const info = await poppler.pdfInfo(pdfPath, { printAsJson: true }) as Record<string, string>;

  // pdfInfo returns "Page size" with format like "595.276 x 841.89 pts (A4)"
  const pageSizeStr = info['page_size'] || info['Page size'] || '';
  const match = pageSizeStr.match(/([\d.]+)\s*x\s*([\d.]+)/);

  if (!match) {
    throw new CropDimensionError(`Could not parse page dimensions from pdfInfo: "${pageSizeStr}"`);
  }

  const widthPts = parseFloat(match[1]);
  const heightPts = parseFloat(match[2]);

  if (widthPts <= 0 || heightPts <= 0) {
    throw new CropDimensionError(`Invalid page dimensions: ${widthPts} x ${heightPts} pts`);
  }

  // Warn if portrait orientation (unusual for engineering drawings)
  if (heightPts > widthPts * 1.1) {
    console.warn(`Page appears to be portrait (${widthPts} x ${heightPts} pts) — engineering drawings are typically landscape`);
  }

  return { widthPts, heightPts };
}

// ---------------------------------------------------------------------------
// Bbox-to-pixel conversion
// ---------------------------------------------------------------------------

interface PixelBbox {
  x: number;
  y: number;
  width: number;
  height: number;
  effectiveDpi: number;
}

/**
 * Converts percentage-based crop region to pixel coordinates.
 * Formula: pixel = (pct / 100) * pageDimPts * (targetDPI / 72)
 * Applies OOM guard: if any dimension > 8000px, reduces DPI proportionally.
 */
export function bboxToPixels(
  region: CropRegion,
  pageWidthPts: number,
  pageHeightPts: number,
): PixelBbox {
  let dpi = region.dpi;

  // Calculate expected dimensions at target DPI
  const widthPct = (region.rightPct - region.leftPct) / 100;
  const heightPct = (region.bottomPct - region.topPct) / 100;

  let expectedWidth = widthPct * pageWidthPts * (dpi / 72);
  let expectedHeight = heightPct * pageHeightPts * (dpi / 72);

  // OOM guard: reduce DPI if any dimension exceeds 8000px
  const maxDim = Math.max(expectedWidth, expectedHeight);
  if (maxDim > MAX_PIXEL_DIM) {
    const scale = MAX_PIXEL_DIM / maxDim;
    dpi = Math.floor(dpi * scale);
    expectedWidth = widthPct * pageWidthPts * (dpi / 72);
    expectedHeight = heightPct * pageHeightPts * (dpi / 72);
    console.warn(`Reduced DPI to ${dpi} for crop "${region.id}" (OOM guard: ${Math.round(maxDim)}px > ${MAX_PIXEL_DIM}px)`);
  }

  // poppler crop coordinates are in points (not pixels)
  const x = Math.round((region.leftPct / 100) * pageWidthPts);
  const y = Math.round((region.topPct / 100) * pageHeightPts);
  const width = Math.round(widthPct * pageWidthPts);
  const height = Math.round(heightPct * pageHeightPts);

  return { x, y, width, height, effectiveDpi: dpi };
}

// ---------------------------------------------------------------------------
// Main crop function
// ---------------------------------------------------------------------------

/**
 * Crops 4 fixed regions from a PDF page and returns them as PNG buffers.
 * Uses poppler pdfToPpm with crop options — does NOT pre-resize.
 *
 * @param pdfPath - Path to the PDF file on disk
 * @param pageNumber - 1-indexed page number
 * @param regions - Crop regions (defaults to FIXED_CROPS)
 * @returns Map of region ID → PNG Buffer
 */
export async function cropRegionsFromPdf(
  pdfPath: string,
  pageNumber: number,
  regions: readonly CropRegion[] = FIXED_CROPS,
): Promise<Map<string, Buffer>> {
  const pageDims = await getPageDimensions(pdfPath);
  const poppler = getPoppler();
  const results = new Map<string, Buffer>();

  // Create temp directory for crop output files
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lector-crop-'));

  try {
    // Timeout via Promise.race
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new CropTimeoutError()), CROP_TIMEOUT_MS);
    });

    const cropAllPromise = (async () => {
      for (const region of regions) {
        const bbox = bboxToPixels(region, pageDims.widthPts, pageDims.heightPts);
        const outputPrefix = path.join(tmpDir, region.id);

        await poppler.pdfToPpm(pdfPath, outputPrefix, {
          pngFile: true,
          resolutionXYAxis: bbox.effectiveDpi,
          firstPageToConvert: pageNumber,
          lastPageToConvert: pageNumber,
          singleFile: true,
          cropXAxis: bbox.x,
          cropYAxis: bbox.y,
          cropWidth: bbox.width,
          cropHeight: bbox.height,
        });

        const outputFile = `${outputPrefix}.png`;
        const buffer = await fs.readFile(outputFile);
        await fs.unlink(outputFile);

        if (buffer.length > MAX_CROP_BUFFER_SIZE) {
          throw new Error(
            `Crop "${region.id}" exceeds ${MAX_CROP_BUFFER_SIZE / (1024 * 1024)}MB limit ` +
            `(${(buffer.length / (1024 * 1024)).toFixed(1)}MB)`,
          );
        }

        results.set(region.id, buffer);
      }
    })();

    await Promise.race([cropAllPromise, timeoutPromise]);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(err =>
      console.warn(`Failed to clean crop temp directory ${tmpDir}:`, (err as Error).message),
    );
  }

  return results;
}
