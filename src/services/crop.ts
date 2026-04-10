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
  rotation: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Four fixed crop regions validated in Experiment 3.
 * 20% overlap between table crops prevents items lost at boundaries.
 * DPI values read from env vars (CROP_DPI, CAJETIN_DPI) so they are configurable.
 */
export function getFixedCrops(family?: 'spool' | 'isometric' | 'unknown'): CropRegion[] {
  // Isometric drawings have a wider page — full-width cajetín triggers OOM guard
  // and gets compressed to ~318 DPI. Using right-half only (45-100%) keeps ~578 DPI
  // while still capturing all structured fields (NUMERO DE LINEA, CONTRATO, REV, etc.)
  const cajetinLeft = (family === 'isometric') ? 45 : 0;

  return [
    { id: 'right_upper',     leftPct: 45, topPct:  0, rightPct: 100, bottomPct: 40, dpi: env.CROP_DPI },
    { id: 'right_center',    leftPct: 45, topPct: 20, rightPct: 100, bottomPct: 60, dpi: env.CROP_DPI },
    { id: 'right_lower',     leftPct: 45, topPct: 45, rightPct: 100, bottomPct: 82, dpi: env.CROP_DPI },
    { id: 'cajetin_titleblk', leftPct: cajetinLeft, topPct: 75, rightPct: 100, bottomPct: 100, dpi: env.CAJETIN_DPI },
  ];
}

/** Static reference for tests and default usage (uses env defaults: 600/800 DPI) */
export const FIXED_CROPS: readonly CropRegion[] = [
  { id: 'right_upper',     leftPct: 45, topPct:  0, rightPct: 100, bottomPct: 40, dpi: 600 },
  { id: 'right_center',    leftPct: 45, topPct: 20, rightPct: 100, bottomPct: 60, dpi: 600 },
  { id: 'right_lower',     leftPct: 45, topPct: 45, rightPct: 100, bottomPct: 82, dpi: 600 },
  { id: 'cajetin_titleblk', leftPct: 0, topPct: 75, rightPct: 100, bottomPct: 100, dpi: 800 },
] as const;

// Claude Vision API limits: 8000px max dimension, 5MB max base64 per image.
// Use 7000px to leave margin — actual rendered PNG size depends on content.
const MAX_PIXEL_DIM = 7000;
const MAX_IMAGE_BYTES = 4.5 * 1024 * 1024; // 4.5 MB (leaves margin for 5 MB base64 limit)
const MAX_CROP_BUFFER_SIZE = 200 * 1024 * 1024; // 200 MB
const CROP_TIMEOUT_MS = env.PDF_TIMEOUT_MS; // reuse existing env var

// ---------------------------------------------------------------------------
// Poppler singleton (matches pdf-processor.ts pattern)
// ---------------------------------------------------------------------------

let popplerInstance: Poppler | null = null;
export function getPoppler(): Poppler {
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

  // pdfInfo returns page size with format like "595.276 x 841.89 pts (A4)"
  // Key varies by node-poppler version: 'pageSize' (JSON mode), 'page_size', or 'Page size'
  const pageSizeStr = info['pageSize'] || info['page_size'] || info['Page size'] || '';
  const match = pageSizeStr.match(/([\d.]+)\s*x\s*([\d.]+)/);

  if (!match) {
    throw new CropDimensionError(`Could not parse page dimensions from pdfInfo: "${pageSizeStr}"`);
  }

  let widthPts = parseFloat(match[1]);
  let heightPts = parseFloat(match[2]);

  if (widthPts <= 0 || heightPts <= 0) {
    throw new CropDimensionError(`Invalid page dimensions: ${widthPts} x ${heightPts} pts`);
  }

  // Parse page rotation (90, 180, 270) — poppler renders the rotated view,
  // so for crop coordinates we need the effective (visual) dimensions.
  const rotStr = info['pageRot'] || info['page_rot'] || info['Page rot'] || '0';
  const rotation = parseInt(rotStr, 10) || 0;

  // When rotation is 90 or 270, the visual dimensions are swapped
  if (rotation === 90 || rotation === 270) {
    console.log(`Page rotation ${rotation}° detected — swapping dimensions for crop (${widthPts} x ${heightPts} → ${heightPts} x ${widthPts})`);
    [widthPts, heightPts] = [heightPts, widthPts];
  }

  return { widthPts, heightPts, rotation };
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

  // poppler pdfToPpm crop coordinates are in pixels at target DPI
  const scale = dpi / 72;
  const x = Math.round((region.leftPct / 100) * pageWidthPts * scale);
  const y = Math.round((region.topPct / 100) * pageHeightPts * scale);
  const width = Math.round(widthPct * pageWidthPts * scale);
  const height = Math.round(heightPct * pageHeightPts * scale);

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
  regions: readonly CropRegion[] = getFixedCrops(),
): Promise<Map<string, Buffer>> {
  const pageDims = await getPageDimensions(pdfPath);
  const poppler = getPoppler();
  const results = new Map<string, Buffer>();

  // Create temp directory for crop output files
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lector-crop-'));

  let timeoutId: NodeJS.Timeout | undefined;
  try {
    // Timeout via Promise.race
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new CropTimeoutError()), CROP_TIMEOUT_MS);
    });

    const cropAllPromise = Promise.all(
      regions.map(async (region) => {
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

        let outputFile = `${outputPrefix}.png`;
        let buffer = await fs.readFile(outputFile);
        await fs.unlink(outputFile);

        // If image exceeds Claude's 5MB base64 limit, re-render at lower DPI
        if (buffer.length > MAX_IMAGE_BYTES) {
          const reducedDpi = Math.floor(bbox.effectiveDpi * (MAX_IMAGE_BYTES / buffer.length) * 0.9);
          console.warn(`Crop "${region.id}" too large (${(buffer.length / (1024 * 1024)).toFixed(1)}MB), re-rendering at ${reducedDpi} DPI`);
          const reducedBbox = bboxToPixels({ ...region, dpi: reducedDpi }, pageDims.widthPts, pageDims.heightPts);
          const retryPrefix = path.join(tmpDir, `${region.id}_retry`);
          await poppler.pdfToPpm(pdfPath, retryPrefix, {
            pngFile: true,
            resolutionXYAxis: reducedBbox.effectiveDpi,
            firstPageToConvert: pageNumber,
            lastPageToConvert: pageNumber,
            singleFile: true,
            cropXAxis: reducedBbox.x,
            cropYAxis: reducedBbox.y,
            cropWidth: reducedBbox.width,
            cropHeight: reducedBbox.height,
          });
          outputFile = `${retryPrefix}.png`;
          buffer = await fs.readFile(outputFile);
          await fs.unlink(outputFile);
        }

        if (buffer.length > MAX_CROP_BUFFER_SIZE) {
          throw new Error(
            `Crop "${region.id}" exceeds ${MAX_CROP_BUFFER_SIZE / (1024 * 1024)}MB limit ` +
            `(${(buffer.length / (1024 * 1024)).toFixed(1)}MB)`,
          );
        }

        return { id: region.id, buffer };
      }),
    ).then((entries) => {
      for (const { id, buffer } of entries) {
        results.set(id, buffer);
      }
    });

    await Promise.race([cropAllPromise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(err =>
      console.warn(`Failed to clean crop temp directory ${tmpDir}:`, (err as Error).message),
    );
  }

  return results;
}
