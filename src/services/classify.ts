import { execFile } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { getPageDimensions, getPoppler, bboxToPixels, type CropRegion } from './crop';

// ── Types ──────────────────────────────────────────────────────────────────

export type DrawingFamily = 'spool' | 'isometric' | 'unknown';

export interface ClassificationResult {
  family: DrawingFamily;
  confidence: number;
  keywords: string[];
  durationMs: number;
}

export interface FamilyMatch {
  family: DrawingFamily;
  confidence: number;
  keywords: string[];
}

// ── Constants ──────────────────────────────────────────────────────────────

/** Small probe region in the bottom-right title block area (cajetín). */
const PROBE_REGION: CropRegion = {
  id: 'classify_probe',
  leftPct: 65,
  topPct: 85,
  rightPct: 95,
  bottomPct: 98,
  dpi: 300,
};

const SPOOL_KEYWORDS = ['TAG SPOOL'];
const ISOMETRIC_KEYWORDS = ['NUMERO ISOMETRICO', 'FORMATO ISOMETRICO'];

const TESSERACT_TIMEOUT_MS = 3000;

// ── Keyword matching (pure, testeable) ─────────────────────────────────────

/**
 * Matches OCR text against discriminant keywords.
 * Exported separately for unit testing without Tesseract.
 */
export function matchFamily(ocrText: string): FamilyMatch {
  const upper = ocrText.toUpperCase();

  const spoolMatches = SPOOL_KEYWORDS.filter(kw => upper.includes(kw));
  const isoMatches = ISOMETRIC_KEYWORDS.filter(kw => upper.includes(kw));

  const hasSpool = spoolMatches.length > 0;
  const hasIso = isoMatches.length > 0;

  if (hasSpool && !hasIso) {
    return { family: 'spool', confidence: 0.95, keywords: spoolMatches };
  }
  if (hasIso && !hasSpool) {
    return { family: 'isometric', confidence: 0.95, keywords: isoMatches };
  }
  if (hasSpool && hasIso) {
    return { family: 'unknown', confidence: 0.3, keywords: [...spoolMatches, ...isoMatches] };
  }
  return { family: 'unknown', confidence: 0, keywords: [] };
}

// ── Tesseract OCR ──────────────────────────────────────────────────────────

function runTesseract(imagePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = execFile(
      'tesseract',
      [imagePath, 'stdout', '--psm', '6'],
      { timeout: TESSERACT_TIMEOUT_MS, maxBuffer: 1024 * 1024 },
      (err, stdout) => {
        if (err) return reject(err);
        resolve(stdout);
      },
    );
    // Ensure cleanup on timeout
    proc.on('error', reject);
  });
}

// ── Main classification function ───────────────────────────────────────────

/**
 * Classify a PDF page as spool or isometric by running Tesseract OCR
 * on a small probe crop from the title block area.
 *
 * Graceful fallback: returns { family: 'unknown' } on any failure.
 */
export async function classifyDrawing(
  pdfPath: string,
  pageNumber: number,
): Promise<ClassificationResult> {
  const start = Date.now();

  try {
    // 1. Get page dimensions
    const dims = await getPageDimensions(pdfPath);

    // 2. Compute pixel bbox for probe region
    const bbox = bboxToPixels(PROBE_REGION, dims.widthPts, dims.heightPts);

    // 3. Crop probe region to temp PNG
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lector-classify-'));
    const outputPrefix = path.join(tmpDir, 'probe');

    try {
      const poppler = getPoppler();
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

      const pngPath = `${outputPrefix}.png`;

      // 4. Run Tesseract OCR
      const ocrText = await runTesseract(pngPath);

      // 5. Match keywords
      const match = matchFamily(ocrText);

      return {
        ...match,
        durationMs: Date.now() - start,
      };
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  } catch (err) {
    const error = err as NodeJS.ErrnoException;

    if (error.code === 'ENOENT' && error.message?.includes('tesseract')) {
      console.warn('Tesseract not installed — classification skipped');
    } else {
      console.warn('Classification failed:', error.message);
    }

    return {
      family: 'unknown',
      confidence: 0,
      keywords: [],
      durationMs: Date.now() - start,
    };
  }
}
