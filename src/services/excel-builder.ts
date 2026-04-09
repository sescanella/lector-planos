import ExcelJS from 'exceljs';
import { stat } from 'fs/promises';

// ── Interfaces ──────────────────────────────────────────────────────────────

export interface SpoolExportData {
  spoolNumber: string;
  confidenceScore: number;
  metadata: {
    rawData: Record<string, any>;
    confidenceScore: number;
  } | null;
  materials: Array<{ rawData: Record<string, any>; confidenceScore: number }>;
  welds: Array<{ rawData: Record<string, any>; confidenceScore: number }>;
  cuts: Array<{ rawData: Record<string, any>; confidenceScore: number }>;
}

export interface ExcelBuildOptions {
  includeConfidence: boolean;
  jobId: string;
}

// ── Column Mappings: [displayName, jsonbKey] ───────────────────────────────

const CAJETIN_MAPPING: [string, string][] = [
  ['OT', 'ot'],
  ['OF', 'of'],
  ['Tag Spool', 'tagSpool'],
  ['Diámetro', 'diameter'],
  ['Cliente', 'client'],
  ['Cliente Final', 'endClient'],
  ['Línea', 'line'],
  ['Revisión', 'revision'],
];

const MATERIALES_MAPPING: [string, string][] = [
  ['ITEM', 'item'],
  ['DIAM.', 'diameter'],
  ['CÓDIGO', 'code'],
  ['DESCRIPCIÓN', 'description'],
  ['CANTIDAD', 'quantity'],
  ['N COLADA', 'heatNumber'],
  ['ORIGEN', 'source'],
];

const SOLDADURAS_MAPPING: [string, string][] = [
  ['N SOLD.', 'weldNumber'],
  ['DIAM.', 'diameter'],
  ['TIPO SOLD.', 'weldType'],
  ['WPS', 'wps'],
  ['FECHA SOLDADURA', 'weldDate'],
  ['SOLDADOR', 'welder'],
  ['FECHA INSP. VISUAL', 'inspectionDate'],
  ['RESULTADO', 'result'],
];

const CORTES_MAPPING: [string, string][] = [
  ['N CORTE', 'cutNumber'],
  ['DIAM.', 'diameter'],
  ['LARGO', 'length'],
  ['EXTREMO 1', 'end1'],
  ['EXTREMO 2', 'end2'],
];

const SHEET_NAME_MAX = 31;
const INVALID_SHEET_CHARS = /[\\/*?:\[\]]/g;

// ── Helpers ─────────────────────────────────────────────────────────────────

function sanitizeSheetName(name: string): string {
  return name.replace(INVALID_SHEET_CHARS, '-');
}

function confidencePercent(score: number): number {
  return Math.round(score * 100);
}

function cellValue(val: unknown): string | number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'object') return JSON.stringify(val);
  if (typeof val === 'string' || typeof val === 'number') return val;
  return String(val);
}

const RESERVED_SHEET_NAMES = new Set(['resumen', 'materiales', 'soldaduras', 'cortes']);

function deduplicateSheetNames(names: string[]): string[] {
  // Pass 1: sanitize + truncate, count occurrences per normalized key
  const sanitized = names.map(raw => {
    let name = sanitizeSheetName(raw);
    if (name.length > SHEET_NAME_MAX) name = name.substring(0, 28);
    return name;
  });
  const freq = new Map<string, number>();
  for (const name of sanitized) {
    const key = name.toLowerCase();
    freq.set(key, (freq.get(key) ?? 0) + 1);
  }

  // Mark reserved names as duplicates so they always get a suffix
  for (const name of sanitized) {
    const key = name.toLowerCase();
    if (RESERVED_SHEET_NAMES.has(key)) {
      freq.set(key, Math.max(freq.get(key) ?? 0, 2));
    }
  }

  // Pass 2: assign suffixes only to keys with duplicates or reserved collisions
  const counts = new Map<string, number>();
  return sanitized.map(name => {
    const key = name.toLowerCase();
    if (freq.get(key)! > 1) {
      const idx = (counts.get(key) ?? 0) + 1;
      counts.set(key, idx);
      const suffix = `-${String(idx).padStart(2, '0')}`;
      return name.substring(0, SHEET_NAME_MAX - suffix.length) + suffix;
    }
    return name;
  });
}

function boldRow(row: ExcelJS.Row): void {
  row.font = { bold: true };
}

function extractField(rawData: Record<string, any>, field: string): unknown {
  // Try exact match first, then case-insensitive
  if (field in rawData) return rawData[field];
  const lower = field.toLowerCase();
  for (const key of Object.keys(rawData)) {
    if (key.toLowerCase() === lower) return rawData[key];
  }
  return null;
}

// ── Main Builder ────────────────────────────────────────────────────────────

export async function buildExcelWorkbook(
  spools: SpoolExportData[],
  options: ExcelBuildOptions,
  outputPath: string
): Promise<{ fileSizeBytes: number }> {
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
    filename: outputPath,
    useStyles: true,
  });

  // ── Resumen sheet ───────────────────────────────────────────────────────
  const resumen = workbook.addWorksheet('Resumen');
  const resumenColumns = [
    'Spool',
    ...CAJETIN_MAPPING.map(([display]) => display),
    'N Materiales', 'N Soldaduras', 'N Cortes',
  ];
  if (options.includeConfidence) resumenColumns.push('Confianza (%)');

  const headerRow = resumen.addRow(resumenColumns);
  boldRow(headerRow);
  headerRow.commit();

  for (const spool of spools) {
    const meta = spool.metadata?.rawData ?? {};
    const values: (string | number | null)[] = [
      spool.spoolNumber,
      ...CAJETIN_MAPPING.map(([, key]) => cellValue(extractField(meta, key))),
      spool.materials.length,
      spool.welds.length,
      spool.cuts.length,
    ];
    if (options.includeConfidence) {
      values.push(confidencePercent(spool.confidenceScore));
    }
    resumen.addRow(values).commit();
  }

  resumen.commit();

  // ── Consolidated sheets (all spools combined) ─────────────────────────
  writeConsolidatedSheet(workbook, 'Materiales', MATERIALES_MAPPING, spools, 'materials', options.includeConfidence);
  writeConsolidatedSheet(workbook, 'Soldaduras', SOLDADURAS_MAPPING, spools, 'welds', options.includeConfidence);
  writeConsolidatedSheet(workbook, 'Cortes', CORTES_MAPPING, spools, 'cuts', options.includeConfidence);

  // ── Per-spool sheets ──────────────────────────────────────────────────
  const rawNames = spools.map(s => s.spoolNumber || 'Sin-Nombre');
  const sheetNames = deduplicateSheetNames(rawNames);

  for (let i = 0; i < spools.length; i++) {
    const spool = spools[i];
    const sheet = workbook.addWorksheet(sheetNames[i]);

    // Section: Cajetin
    const cajetinHeader = sheet.addRow(['Cajetín']);
    boldRow(cajetinHeader);
    cajetinHeader.commit();

    const meta = spool.metadata?.rawData ?? {};
    for (const [display, key] of CAJETIN_MAPPING) {
      sheet.addRow([display, cellValue(extractField(meta, key))]).commit();
    }
    if (options.includeConfidence && spool.metadata) {
      sheet.addRow(['Confianza (%)', confidencePercent(spool.metadata.confidenceScore)]).commit();
    }

    // Blank separator
    sheet.addRow([]).commit();

    // Section: Materiales
    writeSectionTable(sheet, 'Materiales', MATERIALES_MAPPING, spool.materials, options.includeConfidence);

    // Blank separator
    sheet.addRow([]).commit();

    // Section: Soldaduras
    writeSectionTable(sheet, 'Soldaduras', SOLDADURAS_MAPPING, spool.welds, options.includeConfidence);

    // Blank separator
    sheet.addRow([]).commit();

    // Section: Cortes
    writeSectionTable(sheet, 'Cortes', CORTES_MAPPING, spool.cuts, options.includeConfidence);

    sheet.commit();
  }

  await workbook.commit();

  const fileStat = await stat(outputPath);
  return { fileSizeBytes: fileStat.size };
}

function writeConsolidatedSheet(
  workbook: ExcelJS.stream.xlsx.WorkbookWriter,
  sheetName: string,
  mapping: [string, string][],
  spools: SpoolExportData[],
  dataKey: 'materials' | 'welds' | 'cuts',
  includeConfidence: boolean,
): void {
  const sheet = workbook.addWorksheet(sheetName);

  // Header: Spool + mapped columns + optional confidence
  const headerCols = ['Spool', ...mapping.map(([display]) => display)];
  if (includeConfidence) headerCols.push('Confianza (%)');
  const hRow = sheet.addRow(headerCols);
  boldRow(hRow);
  hRow.commit();

  let totalRows = 0;
  for (const spool of spools) {
    const rows = spool[dataKey];
    for (const row of rows) {
      const values: (string | number | null)[] = [
        spool.spoolNumber,
        ...mapping.map(([, key]) => cellValue(extractField(row.rawData, key))),
      ];
      if (includeConfidence) {
        values.push(confidencePercent(row.confidenceScore));
      }
      sheet.addRow(values).commit();
      totalRows++;
    }
  }

  if (totalRows === 0) {
    sheet.addRow(['Sin datos']).commit();
  }

  sheet.commit();
}

function writeSectionTable(
  sheet: ExcelJS.Worksheet,
  sectionName: string,
  mapping: [string, string][],
  rows: Array<{ rawData: Record<string, any>; confidenceScore: number }>,
  includeConfidence: boolean
): void {
  // Section title
  const titleRow = sheet.addRow([sectionName]);
  boldRow(titleRow);
  titleRow.commit();

  // Header row (display names)
  const headerCols = mapping.map(([display]) => display);
  if (includeConfidence) headerCols.push('Confianza (%)');
  const hRow = sheet.addRow(headerCols);
  boldRow(hRow);
  hRow.commit();

  if (rows.length === 0) {
    sheet.addRow(['Sin datos']).commit();
    return;
  }

  for (const row of rows) {
    const values: (string | number | null)[] = mapping.map(([, key]) => cellValue(extractField(row.rawData, key)));
    if (includeConfidence) {
      values.push(confidencePercent(row.confidenceScore));
    }
    sheet.addRow(values).commit();
  }
}
