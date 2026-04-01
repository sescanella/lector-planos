import type { VisionExtractionResult } from '../services/vision';
import { sanityValidate, determineVisionStatus } from '../workers/ai-extraction';

// ---------------------------------------------------------------------------
// Helper: build a valid VisionExtractionResult with sensible defaults
// ---------------------------------------------------------------------------

function makeVisionResult(overrides: Partial<VisionExtractionResult> = {}): VisionExtractionResult {
  return {
    materiales: {
      rows: [{ item: '1', diameter: '2"', code: 'C001', description: 'Pipe', quantity: '1', heatNumber: null, confidence: 0.9 }],
      rawHeaders: ['ITEM', 'DIAM.', 'CODIGO', 'DESCRIPCION', 'CANTIDAD'],
      totalRowsDetected: 1,
      confidence: 0.9,
    },
    soldaduras: null,
    cortes: null,
    cajetin: { ot: 'OT-1', of: 'OF-1', tagSpool: 'SP-001', diameter: '2"', client: 'Client', endClient: 'EndClient', line: 'L-1', revision: 'A', confidence: 0.9 },
    drawingFormat: { paperSize: 'A3', orientation: 'landscape', familyHint: 'unknown' },
    overallConfidence: 0.85,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// sanityValidate
// ---------------------------------------------------------------------------

describe('sanityValidate', () => {
  it('should return no warnings for valid extraction data', () => {
    const data = makeVisionResult();
    const result = sanityValidate(data);
    expect(result.warnings).toHaveLength(0);
    expect(result.needsReview).toBe(false);
  });

  it('should warn on material row count mismatch', () => {
    const data = makeVisionResult({
      materiales: {
        rows: [
          { item: '1', diameter: '2"', code: 'C001', description: 'Pipe', quantity: '1', heatNumber: null, confidence: 0.9 },
          { item: '2', diameter: '3"', code: 'C002', description: 'Elbow', quantity: '2', heatNumber: null, confidence: 0.9 },
          { item: '3', diameter: '4"', code: 'C003', description: 'Tee', quantity: '1', heatNumber: null, confidence: 0.9 },
          { item: '4', diameter: '6"', code: 'C004', description: 'Flange', quantity: '1', heatNumber: null, confidence: 0.9 },
          { item: '5', diameter: '8"', code: 'C005', description: 'Valve', quantity: '1', heatNumber: null, confidence: 0.9 },
        ],
        rawHeaders: ['ITEM', 'DIAM.', 'CODIGO', 'DESCRIPCION', 'CANTIDAD'],
        totalRowsDetected: 10,
        confidence: 0.9,
      },
    });
    const result = sanityValidate(data);
    expect(result.warnings).toContainEqual(
      expect.stringContaining('Material row count mismatch'),
    );
  });

  it('should flag excessive material rows (>50) as needsReview', () => {
    const rows = Array.from({ length: 51 }, (_, i) => ({
      item: String(i + 1), diameter: '2"', code: `C${i}`, description: 'Pipe', quantity: '1', heatNumber: null, confidence: 0.9,
    }));
    const data = makeVisionResult({
      materiales: { rows, rawHeaders: ['ITEM'], totalRowsDetected: 51, confidence: 0.9 },
    });
    const result = sanityValidate(data);
    expect(result.needsReview).toBe(true);
    expect(result.warnings).toContainEqual(
      expect.stringContaining('Excessive material rows'),
    );
  });

  it('should flag excessive weld rows (>30) as needsReview', () => {
    const rows = Array.from({ length: 31 }, (_, i) => ({
      weldNumber: String(i + 1), diameter: '2"', weldType: 'BW', wps: 'WPS-1',
      weldDate: null, welder: null, inspectionDate: null, result: null, confidence: 0.9,
    }));
    const data = makeVisionResult({
      soldaduras: { rows, rawHeaders: ['N SOLD.'], totalRowsDetected: 31, confidence: 0.9 },
    });
    const result = sanityValidate(data);
    expect(result.needsReview).toBe(true);
    expect(result.warnings).toContainEqual(
      expect.stringContaining('Excessive weld rows'),
    );
  });

  it('should flag excessive cut rows (>30) as needsReview', () => {
    const rows = Array.from({ length: 31 }, (_, i) => ({
      cutNumber: String(i + 1), diameter: '2"', length: '100', end1: 'BW', end2: 'PE', confidence: 0.9,
    }));
    const data = makeVisionResult({
      cortes: { rows, rawHeaders: ['N CORTE'], totalRowsDetected: 31, confidence: 0.9 },
    });
    const result = sanityValidate(data);
    expect(result.needsReview).toBe(true);
    expect(result.warnings).toContainEqual(
      expect.stringContaining('Excessive cut rows'),
    );
  });

  it('should demote confidence for invalid quantity (NaN)', () => {
    const data = makeVisionResult({
      materiales: {
        rows: [{ item: '1', diameter: '2"', code: 'C001', description: 'Pipe', quantity: 'abc', heatNumber: null, confidence: 0.9 }],
        rawHeaders: ['ITEM'], totalRowsDetected: 1, confidence: 0.9,
      },
    });
    sanityValidate(data);
    expect(data.materiales!.rows[0].confidence).toBeLessThanOrEqual(0.3);
  });

  it('should demote confidence for zero quantity', () => {
    const data = makeVisionResult({
      materiales: {
        rows: [{ item: '1', diameter: '2"', code: 'C001', description: 'Pipe', quantity: '0', heatNumber: null, confidence: 0.9 }],
        rawHeaders: ['ITEM'], totalRowsDetected: 1, confidence: 0.9,
      },
    });
    const result = sanityValidate(data);
    expect(result.warnings).toContainEqual(
      expect.stringContaining('Invalid quantity "0"'),
    );
    expect(data.materiales!.rows[0].confidence).toBeLessThanOrEqual(0.3);
  });

  it('should deduplicate material rows and warn', () => {
    const data = makeVisionResult({
      materiales: {
        rows: [
          { item: '1', diameter: '2"', code: 'C001', description: 'Pipe', quantity: '1', heatNumber: null, confidence: 0.8 },
          { item: '1', diameter: '2"', code: 'C001', description: 'Pipe', quantity: '1', heatNumber: null, confidence: 0.95 },
        ],
        rawHeaders: ['ITEM'], totalRowsDetected: 2, confidence: 0.9,
      },
    });
    const result = sanityValidate(data);
    expect(data.materiales!.rows).toHaveLength(1);
    expect(data.materiales!.rows[0].confidence).toBe(0.95);
    expect(result.warnings).toContainEqual(
      expect.stringContaining('Deduplicated'),
    );
  });

  it('should deduplicate weld rows and warn', () => {
    const data = makeVisionResult({
      soldaduras: {
        rows: [
          { weldNumber: '1', diameter: '2"', weldType: 'BW', wps: 'WPS-1', weldDate: null, welder: null, inspectionDate: null, result: null, confidence: 0.8 },
          { weldNumber: '1', diameter: '2"', weldType: 'BW', wps: 'WPS-1', weldDate: null, welder: null, inspectionDate: null, result: null, confidence: 0.95 },
        ],
        rawHeaders: ['N SOLD.'], totalRowsDetected: 2, confidence: 0.9,
      },
    });
    const result = sanityValidate(data);
    expect(data.soldaduras!.rows).toHaveLength(1);
    expect(result.warnings).toContainEqual(
      expect.stringContaining('Deduplicated'),
    );
  });

  it('should deduplicate cut rows and warn', () => {
    const data = makeVisionResult({
      cortes: {
        rows: [
          { cutNumber: '1', diameter: '2"', length: '100', end1: 'BW', end2: 'PE', confidence: 0.8 },
          { cutNumber: '1', diameter: '2"', length: '100', end1: 'BW', end2: 'PE', confidence: 0.95 },
        ],
        rawHeaders: ['N CORTE'], totalRowsDetected: 2, confidence: 0.9,
      },
    });
    const result = sanityValidate(data);
    expect(data.cortes!.rows).toHaveLength(1);
    expect(result.warnings).toContainEqual(
      expect.stringContaining('Deduplicated'),
    );
  });

  it('should warn when cajetin.tagSpool is empty', () => {
    const data = makeVisionResult({
      cajetin: { ot: 'OT-1', of: 'OF-1', tagSpool: '', diameter: '2"', client: 'Client', endClient: null, line: 'L-1', revision: 'A', confidence: 0.9 },
    });
    const result = sanityValidate(data);
    expect(result.warnings).toContainEqual(
      expect.stringContaining('cajetin.tagSpool is empty'),
    );
  });

  it('should handle null materiales/soldaduras/cortes sections', () => {
    const data = makeVisionResult({
      materiales: null,
      soldaduras: null,
      cortes: null,
    });
    const result = sanityValidate(data);
    // Should not throw; only cajetin warning if tagSpool is set
    expect(result.needsReview).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// determineVisionStatus
// ---------------------------------------------------------------------------

describe('determineVisionStatus', () => {
  it('should return "completed" when overallConfidence >= 0.6 and has tables', () => {
    const data = makeVisionResult({ overallConfidence: 0.8 });
    expect(determineVisionStatus(data)).toBe('completed');
  });

  it('should return "skipped" when no tables and cajetin confidence < 0.5', () => {
    const data = makeVisionResult({
      materiales: null,
      soldaduras: null,
      cortes: null,
      cajetin: { ot: null, of: null, tagSpool: null, diameter: null, client: null, endClient: null, line: null, revision: null, confidence: 0.3 },
      overallConfidence: 0.3,
    });
    expect(determineVisionStatus(data)).toBe('skipped');
  });

  it('should return "completed_partial" when overallConfidence >= 0.4', () => {
    const data = makeVisionResult({
      materiales: null,
      soldaduras: null,
      cortes: null,
      cajetin: { ot: 'OT-1', of: null, tagSpool: 'SP-001', diameter: null, client: null, endClient: null, line: null, revision: null, confidence: 0.7 },
      overallConfidence: 0.5,
    });
    expect(determineVisionStatus(data)).toBe('completed_partial');
  });

  it('should return "completed_partial" for cajetin-only with confidence >= 0.5', () => {
    const data = makeVisionResult({
      materiales: null,
      soldaduras: null,
      cortes: null,
      cajetin: { ot: 'OT-1', of: null, tagSpool: 'SP-001', diameter: null, client: null, endClient: null, line: null, revision: null, confidence: 0.6 },
      overallConfidence: 0.35,
    });
    expect(determineVisionStatus(data)).toBe('completed_partial');
  });

  it('should return "failed" when overallConfidence < 0.4 with tables present', () => {
    // "failed" requires: tables exist (otherwise "skipped"), overall < 0.4 (otherwise "completed"/"completed_partial")
    const data = makeVisionResult({
      overallConfidence: 0.2,
    });
    expect(determineVisionStatus(data)).toBe('failed');
  });

  it('should return "completed" at exact boundary 0.6 with tables', () => {
    const data = makeVisionResult({ overallConfidence: 0.6 });
    expect(determineVisionStatus(data)).toBe('completed');
  });

  it('should return "failed" at exact boundary 0.39 with tables', () => {
    // With tables present and overall 0.39 (< 0.4), it falls through to "failed"
    const data = makeVisionResult({ overallConfidence: 0.39 });
    expect(determineVisionStatus(data)).toBe('failed');
  });

  it('should handle empty rows arrays (not null) as no tables', () => {
    const data = makeVisionResult({
      materiales: { rows: [], rawHeaders: [], totalRowsDetected: 0, confidence: 0.5 },
      soldaduras: { rows: [], rawHeaders: [], totalRowsDetected: 0, confidence: 0.5 },
      cortes: { rows: [], rawHeaders: [], totalRowsDetected: 0, confidence: 0.5 },
      cajetin: { ot: null, of: null, tagSpool: null, diameter: null, client: null, endClient: null, line: null, revision: null, confidence: 0.3 },
      overallConfidence: 0.2,
    });
    // Empty rows = no tables, cajetin < 0.5, overall < 0.4 → skipped
    expect(determineVisionStatus(data)).toBe('skipped');
  });
});
