import {
  parseVisionResponse,
  VisionRetryableError,
  VisionFatalError,
  type VisionExtractionResult,
} from '../services/vision';

// ---------------------------------------------------------------------------
// Helper: minimal valid VisionExtractionResult
// ---------------------------------------------------------------------------

function makeValidResult(): VisionExtractionResult {
  return {
    materiales: {
      rows: [{ item: '1', diameter: '2"', code: 'ABC', description: 'Pipe', quantity: '1', heatNumber: null, confidence: 0.95 }],
      rawHeaders: ['ITEM', 'DIAM.', 'CODIGO', 'DESCRIPCION', 'CANTIDAD'],
      totalRowsDetected: 1,
      confidence: 0.95,
    },
    soldaduras: null,
    cortes: null,
    cajetin: { ot: '123', of: '456', tagSpool: 'SP-001', diameter: '2"', client: 'ACME', endClient: null, line: 'L-100', revision: 'A', confidence: 0.9 },
    drawingFormat: { paperSize: 'A3', orientation: 'landscape', familyHint: 'MK/FastPack' },
    overallConfidence: 0.92,
  };
}

// ---------------------------------------------------------------------------
// parseVisionResponse — JSON parsing fallback chain
// ---------------------------------------------------------------------------

describe('parseVisionResponse', () => {
  it('parses valid JSON directly', () => {
    const json = JSON.stringify(makeValidResult());
    const result = parseVisionResponse(json);
    expect(result.materiales.rows).toHaveLength(1);
    expect(result.materiales.rows[0].item).toBe('1');
    expect(result.overallConfidence).toBe(0.92);
  });

  it('extracts JSON from markdown code fences', () => {
    const json = JSON.stringify(makeValidResult());
    const wrapped = '```json\n' + json + '\n```';
    const result = parseVisionResponse(wrapped);
    expect(result.materiales.rows).toHaveLength(1);
  });

  it('extracts JSON from code fences without language tag', () => {
    const json = JSON.stringify(makeValidResult());
    const wrapped = '```\n' + json + '\n```';
    const result = parseVisionResponse(wrapped);
    expect(result.overallConfidence).toBe(0.92);
  });

  it('extracts outermost {...} block via regex fallback', () => {
    const json = JSON.stringify(makeValidResult());
    const wrapped = 'Here is the extraction result:\n\n' + json + '\n\nDone.';
    const result = parseVisionResponse(wrapped);
    expect(result.materiales.rows[0].code).toBe('ABC');
  });

  it('throws on completely unparseable input', () => {
    expect(() => parseVisionResponse('This is not JSON at all.')).toThrow(/Failed to parse/);
  });

  it('throws on empty string', () => {
    expect(() => parseVisionResponse('')).toThrow();
  });

  it('throws on truncated JSON', () => {
    const json = JSON.stringify(makeValidResult());
    const truncated = json.slice(0, json.length / 2);
    expect(() => parseVisionResponse(truncated)).toThrow(/Failed to parse/);
  });

  it('handles null soldaduras and cortes sections', () => {
    const data = makeValidResult();
    data.soldaduras = null;
    data.cortes = null;
    const result = parseVisionResponse(JSON.stringify(data));
    expect(result.soldaduras).toBeNull();
    expect(result.cortes).toBeNull();
  });

  it('preserves split table source field', () => {
    const data = makeValidResult();
    data.materiales.source = 'taller_campo';
    data.materiales.rows[0].source = 'taller';
    const result = parseVisionResponse(JSON.stringify(data));
    expect(result.materiales.source).toBe('taller_campo');
    expect(result.materiales.rows[0].source).toBe('taller');
  });
});

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

describe('VisionRetryableError', () => {
  it('has correct name and retryAfterMs', () => {
    const err = new VisionRetryableError('rate limited', 30000);
    expect(err.name).toBe('VisionRetryableError');
    expect(err.retryAfterMs).toBe(30000);
    expect(err).toBeInstanceOf(Error);
  });
});

describe('VisionFatalError', () => {
  it('has correct name and shouldPauseQueue flag', () => {
    const err = new VisionFatalError('auth error', true);
    expect(err.name).toBe('VisionFatalError');
    expect(err.shouldPauseQueue).toBe(true);
    expect(err).toBeInstanceOf(Error);
  });

  it('defaults shouldPauseQueue to false', () => {
    const err = new VisionFatalError('bad request');
    expect(err.shouldPauseQueue).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Cost calculation
// ---------------------------------------------------------------------------

describe('cost calculation', () => {
  it('follows Sonnet pricing: $3/MTok input + $15/MTok output', () => {
    const inputTokens = 5300;
    const outputTokens = 2500;
    const cost = (inputTokens * 3 + outputTokens * 15) / 1_000_000;
    expect(cost).toBeCloseTo(0.0534, 4);
  });
});
