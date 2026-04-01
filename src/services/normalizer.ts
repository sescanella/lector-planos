// ---------------------------------------------------------------------------
// Header normalization service for drawing family detection and mapping.
// Maps client-specific column headers to canonical field names and
// deduplicates rows from overlapping crop regions.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FamilyId = 'familia_a' | 'familia_b' | 'familia_c' | 'unknown';

export interface MaterialRow {
  item: string;
  diameter: string;
  code: string;
  description: string;
  quantity: string;
  heatNumber: string | null;
  source?: 'taller' | 'campo';
  confidence: number;
}

// ---------------------------------------------------------------------------
// Header mappings per family
// ---------------------------------------------------------------------------

/** Maps raw header → canonical field name for materials table. */
type HeaderMap = Record<string, keyof MaterialRow>;

const FAMILIA_A_HEADERS: HeaderMap = {
  'PT NO': 'item',
  'DIA (IN)': 'diameter',
  'CMDTY CODE': 'code',
  'DESCRIPCION': 'description',
  'CANT.': 'quantity',
};

const FAMILIA_B_HEADERS: HeaderMap = {
  'ITEM': 'item',
  'DIAM.': 'diameter',
  'CODIGO': 'code',
  'DESCRIPCION': 'description',
  'CANTIDAD': 'quantity',
  'N COLADA': 'heatNumber',
};

// Familia C uses same headers as Familia B
const FAMILIA_C_HEADERS: HeaderMap = { ...FAMILIA_B_HEADERS };

const HEADER_MAPS: Record<Exclude<FamilyId, 'unknown'>, HeaderMap> = {
  familia_a: FAMILIA_A_HEADERS,
  familia_b: FAMILIA_B_HEADERS,
  familia_c: FAMILIA_C_HEADERS,
};

// ---------------------------------------------------------------------------
// Family detection keywords
// ---------------------------------------------------------------------------

/** Keywords that identify each family from raw headers or familyHint. */
const FAMILY_SIGNATURES: Record<Exclude<FamilyId, 'unknown'>, string[]> = {
  familia_a: ['PT NO', 'DIA (IN)', 'CMDTY CODE', 'CANT.', 'EPC', 'CENTINELA', 'FLUOR', 'SALFA', 'MATERIAL DE TALLER'],
  familia_b: ['ITEM', 'DIAM.', 'CODIGO', 'CANTIDAD', 'MK', 'FASTPACK', 'FAST PACK', 'LISTADO'],
  familia_c: ['BESALCO', 'FP'],
};

// ---------------------------------------------------------------------------
// Family detection
// ---------------------------------------------------------------------------

/**
 * Detects drawing family from raw headers and/or a familyHint string.
 * Checks hint first, then header signatures.
 */
export function detectFamily(rawHeaders: string[], familyHint: string = ''): FamilyId {
  const upperHint = familyHint.toUpperCase();
  const upperHeaders = rawHeaders.map(h => h.toUpperCase().trim());
  const combined = [...upperHeaders, upperHint];

  // Score each family by how many signature keywords match
  let bestFamily: FamilyId = 'unknown';
  let bestScore = 0;

  for (const [family, signatures] of Object.entries(FAMILY_SIGNATURES) as [Exclude<FamilyId, 'unknown'>, string[]][]) {
    let score = 0;
    for (const sig of signatures) {
      const upperSig = sig.toUpperCase();
      // Hint matches get a bonus (+5) to prioritize explicit family identification
      if (upperHint.includes(upperSig)) {
        score += 5;
      } else if (upperHeaders.some(h => h.includes(upperSig))) {
        score++;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestFamily = family;
    }
  }

  // Require at least 2 matching signatures to avoid false positives
  return bestScore >= 2 ? bestFamily : 'unknown';
}

// ---------------------------------------------------------------------------
// Row normalization
// ---------------------------------------------------------------------------

/**
 * Maps a raw row (keyed by client-specific headers) to canonical MaterialRow.
 * For unknown families, attempts a best-effort pass-through using header position.
 */
export function normalizeMaterialRow(
  rawRow: Record<string, string>,
  family: FamilyId,
): MaterialRow {
  const row: MaterialRow = {
    item: '',
    diameter: '',
    code: '',
    description: '',
    quantity: '',
    heatNumber: null,
    confidence: 0,
  };

  if (family === 'unknown') {
    // Best-effort: use raw keys directly as canonical names
    for (const [key, value] of Object.entries(rawRow)) {
      const lower = key.toLowerCase();
      if (lower === 'item' || lower === 'pt no') row.item = value;
      else if (lower === 'diameter' || lower.includes('diam') || lower === 'dia (in)') row.diameter = value;
      else if (lower === 'code' || lower.includes('codigo') || lower === 'cmdty code') row.code = value;
      else if (lower.includes('descrip')) row.description = value;
      else if (lower === 'quantity' || lower.includes('cantidad') || lower === 'cant.') row.quantity = value;
      else if (lower.includes('colada') || lower === 'heatnumber') row.heatNumber = value || null;
      else if (lower === 'confidence') row.confidence = parseFloat(value) || 0;
      else if (lower === 'source' && (value === 'taller' || value === 'campo')) row.source = value;
    }
    return row;
  }

  const headerMap = HEADER_MAPS[family];

  for (const [rawHeader, canonicalField] of Object.entries(headerMap)) {
    // Find the raw row key matching this header (case-insensitive)
    const matchingKey = Object.keys(rawRow).find(
      k => k.toUpperCase().trim() === rawHeader.toUpperCase(),
    );
    if (matchingKey) {
      const value = rawRow[matchingKey];
      switch (canonicalField) {
        case 'heatNumber':
          row.heatNumber = value || null;
          break;
        case 'item':
          row.item = value;
          break;
        case 'diameter':
          row.diameter = value;
          break;
        case 'code':
          row.code = value;
          break;
        case 'description':
          row.description = value;
          break;
        case 'quantity':
          row.quantity = value;
          break;
      }
    }
  }

  // Preserve confidence and source if present in raw row
  const confKey = Object.keys(rawRow).find(k => k.toLowerCase() === 'confidence');
  if (confKey) row.confidence = parseFloat(rawRow[confKey]) || 0;

  const srcKey = Object.keys(rawRow).find(k => k.toLowerCase() === 'source');
  if (srcKey && (rawRow[srcKey] === 'taller' || rawRow[srcKey] === 'campo')) {
    row.source = rawRow[srcKey] as 'taller' | 'campo';
  }

  return row;
}

// ---------------------------------------------------------------------------
// Unmapped header detection
// ---------------------------------------------------------------------------

/**
 * Returns headers from the raw header list that don't map to any canonical field.
 * Useful for logging/debugging unknown columns.
 */
export function findUnmappedHeaders(rawHeaders: string[], family: FamilyId): string[] {
  if (family === 'unknown') return [...rawHeaders];

  const headerMap = HEADER_MAPS[family];
  const mappedHeaders = new Set(Object.keys(headerMap).map(h => h.toUpperCase()));

  return rawHeaders.filter(h => !mappedHeaders.has(h.toUpperCase().trim()));
}

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

/**
 * Deduplicates material rows from overlapping crop regions.
 * Two rows are considered duplicates when item + description + quantity match.
 * Keeps the row with higher confidence.
 */
export function deduplicateRows(rows: MaterialRow[]): MaterialRow[] {
  const seen = new Map<string, MaterialRow>();

  for (const row of rows) {
    const key = `${(row.item || '').trim()}|${(row.description || '').trim()}|${(row.quantity || '').trim()}`.toLowerCase();
    const existing = seen.get(key);

    if (!existing || row.confidence > existing.confidence) {
      seen.set(key, row);
    }
  }

  return Array.from(seen.values());
}

/**
 * Generic deduplication for rows with a confidence field.
 * Uses a key-builder function to determine identity.
 */
function deduplicateByKey<T extends { confidence: number }>(
  rows: T[],
  keyFn: (row: T) => string,
): T[] {
  const seen = new Map<string, T>();
  for (const row of rows) {
    const key = keyFn(row).toLowerCase();
    const existing = seen.get(key);
    if (!existing || row.confidence > existing.confidence) {
      seen.set(key, row);
    }
  }
  return Array.from(seen.values());
}

import type { WeldRow, CutRow } from './vision';

/**
 * Deduplicates weld rows from overlapping crop regions.
 * Key: weldNumber + diameter + weldType.
 */
export function deduplicateWeldRows(rows: WeldRow[]): WeldRow[] {
  return deduplicateByKey(rows, r =>
    `${(r.weldNumber || '').trim()}|${(r.diameter || '').trim()}|${(r.weldType || '').trim()}`
  );
}

/**
 * Deduplicates cut rows from overlapping crop regions.
 * Key: cutNumber + diameter + length.
 */
export function deduplicateCutRows(rows: CutRow[]): CutRow[] {
  return deduplicateByKey(rows, r =>
    `${(r.cutNumber || '').trim()}|${(r.diameter || '').trim()}|${(r.length || '').trim()}`
  );
}
