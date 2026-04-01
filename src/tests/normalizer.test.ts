import {
  detectFamily,
  normalizeMaterialRow,
  findUnmappedHeaders,
  deduplicateRows,
  type MaterialRow,
} from '../services/normalizer';

// ---------------------------------------------------------------------------
// detectFamily
// ---------------------------------------------------------------------------

describe('detectFamily', () => {
  it('detects familia_a from EPC/Centinela headers', () => {
    const headers = ['PT NO', 'DIA (IN)', 'CMDTY CODE', 'DESCRIPCION', 'CANT.'];
    expect(detectFamily(headers)).toBe('familia_a');
  });

  it('detects familia_a from familyHint alone', () => {
    const headers = ['PT NO', 'DIA (IN)'];
    expect(detectFamily(headers, 'EPC/Centinela')).toBe('familia_a');
  });

  it('detects familia_a from MATERIAL DE TALLER keyword', () => {
    const headers = ['PT NO', 'MATERIAL DE TALLER'];
    expect(detectFamily(headers)).toBe('familia_a');
  });

  it('detects familia_b from MK/FastPack headers', () => {
    const headers = ['ITEM', 'DIAM.', 'CODIGO', 'DESCRIPCION', 'CANTIDAD', 'N COLADA'];
    expect(detectFamily(headers)).toBe('familia_b');
  });

  it('detects familia_b from familyHint', () => {
    const headers = ['ITEM', 'DIAM.'];
    expect(detectFamily(headers, 'MK/FastPack')).toBe('familia_b');
  });

  it('detects familia_c from Besalco hint with matching headers', () => {
    const headers = ['ITEM', 'DIAM.', 'CODIGO'];
    expect(detectFamily(headers, 'Besalco/FP')).toBe('familia_c');
  });

  it('returns unknown when headers match no family', () => {
    const headers = ['COL_A', 'COL_B', 'COL_C'];
    expect(detectFamily(headers)).toBe('unknown');
  });

  it('returns unknown when only 1 signature matches (below threshold)', () => {
    const headers = ['ITEM', 'FOO', 'BAR'];
    expect(detectFamily(headers)).toBe('unknown');
  });

  it('is case-insensitive', () => {
    const headers = ['pt no', 'dia (in)', 'cmdty code'];
    expect(detectFamily(headers)).toBe('familia_a');
  });
});

// ---------------------------------------------------------------------------
// normalizeMaterialRow
// ---------------------------------------------------------------------------

describe('normalizeMaterialRow', () => {
  it('maps familia_a headers to canonical fields', () => {
    const rawRow = {
      'PT NO': '1',
      'DIA (IN)': '2"',
      'CMDTY CODE': 'A-123',
      'DESCRIPCION': 'Brida',
      'CANT.': '4',
      'confidence': '0.95',
    };
    const row = normalizeMaterialRow(rawRow, 'familia_a');
    expect(row.item).toBe('1');
    expect(row.diameter).toBe('2"');
    expect(row.code).toBe('A-123');
    expect(row.description).toBe('Brida');
    expect(row.quantity).toBe('4');
    expect(row.heatNumber).toBeNull(); // familia_a has no heatNumber mapping
    expect(row.confidence).toBe(0.95);
  });

  it('maps familia_b headers including heatNumber', () => {
    const rawRow = {
      'ITEM': '3',
      'DIAM.': '4"',
      'CODIGO': 'B-456',
      'DESCRIPCION': 'Codo',
      'CANTIDAD': '2',
      'N COLADA': 'H-789',
      'confidence': '0.88',
    };
    const row = normalizeMaterialRow(rawRow, 'familia_b');
    expect(row.item).toBe('3');
    expect(row.diameter).toBe('4"');
    expect(row.code).toBe('B-456');
    expect(row.quantity).toBe('2');
    expect(row.heatNumber).toBe('H-789');
    expect(row.confidence).toBe(0.88);
  });

  it('maps familia_c headers (same as familia_b)', () => {
    const rawRow = {
      'ITEM': '5',
      'DIAM.': '6"',
      'CODIGO': 'C-001',
      'DESCRIPCION': 'Tubo',
      'CANTIDAD': '1',
      'N COLADA': '',
      'confidence': '0.7',
    };
    const row = normalizeMaterialRow(rawRow, 'familia_c');
    expect(row.item).toBe('5');
    expect(row.heatNumber).toBeNull(); // empty string becomes null
  });

  it('preserves source field for split tables', () => {
    const rawRow = {
      'PT NO': '1',
      'DIA (IN)': '2"',
      'CMDTY CODE': 'X',
      'DESCRIPCION': 'Pipe',
      'CANT.': '1',
      'source': 'taller',
      'confidence': '0.9',
    };
    const row = normalizeMaterialRow(rawRow, 'familia_a');
    expect(row.source).toBe('taller');
  });

  it('handles unknown family with best-effort mapping', () => {
    const rawRow = {
      'ITEM': '1',
      'DIAM.': '3"',
      'CODIGO': 'Z-100',
      'DESCRIPCION': 'Valve',
      'CANTIDAD': '2',
      'confidence': '0.6',
    };
    const row = normalizeMaterialRow(rawRow, 'unknown');
    expect(row.item).toBe('1');
    expect(row.diameter).toBe('3"');
    expect(row.code).toBe('Z-100');
    expect(row.description).toBe('Valve');
    expect(row.quantity).toBe('2');
  });
});

// ---------------------------------------------------------------------------
// findUnmappedHeaders
// ---------------------------------------------------------------------------

describe('findUnmappedHeaders', () => {
  it('returns empty array when all headers are mapped (familia_b)', () => {
    const headers = ['ITEM', 'DIAM.', 'CODIGO', 'DESCRIPCION', 'CANTIDAD', 'N COLADA'];
    expect(findUnmappedHeaders(headers, 'familia_b')).toEqual([]);
  });

  it('detects unmapped headers', () => {
    const headers = ['ITEM', 'DIAM.', 'CODIGO', 'UNKNOWN_COL', 'CANTIDAD'];
    expect(findUnmappedHeaders(headers, 'familia_b')).toEqual(['UNKNOWN_COL']);
  });

  it('returns all headers for unknown family', () => {
    const headers = ['A', 'B', 'C'];
    expect(findUnmappedHeaders(headers, 'unknown')).toEqual(['A', 'B', 'C']);
  });

  it('detects unmapped headers for familia_a', () => {
    const headers = ['PT NO', 'DIA (IN)', 'EXTRA_FIELD'];
    expect(findUnmappedHeaders(headers, 'familia_a')).toEqual(['EXTRA_FIELD']);
  });
});

// ---------------------------------------------------------------------------
// deduplicateRows
// ---------------------------------------------------------------------------

describe('deduplicateRows', () => {
  it('removes duplicate rows keeping higher confidence', () => {
    const rows: MaterialRow[] = [
      { item: '1', diameter: '2"', code: 'A', description: 'Pipe', quantity: '3', heatNumber: null, confidence: 0.8 },
      { item: '1', diameter: '2"', code: 'A', description: 'Pipe', quantity: '3', heatNumber: null, confidence: 0.95 },
    ];
    const result = deduplicateRows(rows);
    expect(result).toHaveLength(1);
    expect(result[0].confidence).toBe(0.95);
  });

  it('keeps distinct rows', () => {
    const rows: MaterialRow[] = [
      { item: '1', diameter: '2"', code: 'A', description: 'Pipe', quantity: '3', heatNumber: null, confidence: 0.9 },
      { item: '2', diameter: '4"', code: 'B', description: 'Elbow', quantity: '1', heatNumber: null, confidence: 0.85 },
    ];
    const result = deduplicateRows(rows);
    expect(result).toHaveLength(2);
  });

  it('returns empty array for empty input', () => {
    expect(deduplicateRows([])).toEqual([]);
  });

  it('deduplicates case-insensitively', () => {
    const rows: MaterialRow[] = [
      { item: '1', diameter: '2"', code: 'A', description: 'PIPE', quantity: '3', heatNumber: null, confidence: 0.7 },
      { item: '1', diameter: '2"', code: 'A', description: 'pipe', quantity: '3', heatNumber: null, confidence: 0.9 },
    ];
    const result = deduplicateRows(rows);
    expect(result).toHaveLength(1);
    expect(result[0].confidence).toBe(0.9);
  });

  it('preserves source field on deduplicated rows', () => {
    const rows: MaterialRow[] = [
      { item: '1', diameter: '2"', code: 'A', description: 'Pipe', quantity: '3', heatNumber: null, source: 'taller', confidence: 0.6 },
      { item: '1', diameter: '2"', code: 'A', description: 'Pipe', quantity: '3', heatNumber: null, source: 'taller', confidence: 0.95 },
    ];
    const result = deduplicateRows(rows);
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('taller');
  });
});
