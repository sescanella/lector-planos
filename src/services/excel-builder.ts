import ExcelJS from 'exceljs';
import * as fs from 'fs';

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

// ── Constants ───────────────────────────────────────────────────────────────

const CAJETIN_FIELDS = [
  'OT', 'OF', 'Tag Spool', 'Diametro', 'Cliente', 'Cliente Final', 'Linea', 'Revision',
];

const MATERIALES_COLUMNS = [
  'ITEM', 'DIAM.', 'CODIGO', 'DESCRIPCION', 'CANTIDAD', 'N COLADA', 'ORIGEN',
];

const SOLDADURAS_COLUMNS = [
  'N SOLD.', 'DIAM.', 'TIPO SOLD.', 'WPS', 'FECHA SOLDADURA', 'SOLDADOR',
  'FECHA INSP. VISUAL', 'RESULTADO',
];

const CORTES_COLUMNS = [
  'N CORTE', 'DIAM.', 'LARGO', 'EXTREMO 1', 'EXTREMO 2',
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

function cellValue(val: any): string | number | null {
  if (val === null || val === undefined) return null;
  return val;
}

function deduplicateSheetNames(names: string[]): string[] {
  const counts = new Map<string, number>();
  const result: string[] = [];

  for (const raw of names) {
    let name = sanitizeSheetName(raw);

    if (name.length > SHEET_NAME_MAX) {
      name = name.substring(0, 28);
    }

    const key = name.toLowerCase();
    const count = counts.get(key) ?? 0;

    if (count > 0 || names.filter(n => sanitizeSheetName(n).substring(0, name.length === 28 ? 28 : SHEET_NAME_MAX).toLowerCase() === key).length > 1) {
      const suffix = `-${String(count + 1).padStart(2, '0')}`;
      name = name.substring(0, SHEET_NAME_MAX - suffix.length) + suffix;
    }

    counts.set(key, count + 1);
    result.push(name);
  }

  return result;
}

function boldRow(row: ExcelJS.Row): void {
  row.font = { bold: true };
}

function extractField(rawData: Record<string, any>, field: string): any {
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
    'Spool', 'OT', 'OF', 'Tag Spool', 'Diametro', 'Cliente', 'Cliente Final',
    'Linea', 'Revision', 'N Materiales', 'N Soldaduras', 'N Cortes',
  ];
  if (options.includeConfidence) resumenColumns.push('Confianza (%)');

  const headerRow = resumen.addRow(resumenColumns);
  boldRow(headerRow);
  headerRow.commit();

  for (const spool of spools) {
    const meta = spool.metadata?.rawData ?? {};
    const values: any[] = [
      spool.spoolNumber,
      cellValue(extractField(meta, 'OT')),
      cellValue(extractField(meta, 'OF')),
      cellValue(extractField(meta, 'Tag Spool')),
      cellValue(extractField(meta, 'Diametro')),
      cellValue(extractField(meta, 'Cliente')),
      cellValue(extractField(meta, 'Cliente Final')),
      cellValue(extractField(meta, 'Linea')),
      cellValue(extractField(meta, 'Revision')),
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

  // ── Per-spool sheets ──────────────────────────────────────────────────
  const rawNames = spools.map(s => s.spoolNumber || 'Sin-Nombre');
  const sheetNames = deduplicateSheetNames(rawNames);

  for (let i = 0; i < spools.length; i++) {
    const spool = spools[i];
    const sheet = workbook.addWorksheet(sheetNames[i]);

    // Section: Cajetin
    const cajetinHeader = sheet.addRow(['Cajetin']);
    boldRow(cajetinHeader);
    cajetinHeader.commit();

    const meta = spool.metadata?.rawData ?? {};
    for (const field of CAJETIN_FIELDS) {
      sheet.addRow([field, cellValue(extractField(meta, field))]).commit();
    }
    if (options.includeConfidence && spool.metadata) {
      sheet.addRow(['Confianza (%)', confidencePercent(spool.metadata.confidenceScore)]).commit();
    }

    // Blank separator
    sheet.addRow([]).commit();

    // Section: Materiales
    writeSectionTable(sheet, 'Materiales', MATERIALES_COLUMNS, spool.materials, options.includeConfidence);

    // Blank separator
    sheet.addRow([]).commit();

    // Section: Soldaduras
    writeSectionTable(sheet, 'Soldaduras', SOLDADURAS_COLUMNS, spool.welds, options.includeConfidence);

    // Blank separator
    sheet.addRow([]).commit();

    // Section: Cortes
    writeSectionTable(sheet, 'Cortes', CORTES_COLUMNS, spool.cuts, options.includeConfidence);

    sheet.commit();
  }

  await workbook.commit();

  const stat = fs.statSync(outputPath);
  return { fileSizeBytes: stat.size };
}

function writeSectionTable(
  sheet: ExcelJS.Worksheet,
  sectionName: string,
  columns: string[],
  rows: Array<{ rawData: Record<string, any>; confidenceScore: number }>,
  includeConfidence: boolean
): void {
  // Section title
  const titleRow = sheet.addRow([sectionName]);
  boldRow(titleRow);
  titleRow.commit();

  // Header row
  const headerCols = [...columns];
  if (includeConfidence) headerCols.push('Confianza (%)');
  const hRow = sheet.addRow(headerCols);
  boldRow(hRow);
  hRow.commit();

  if (rows.length === 0) {
    sheet.addRow(['Sin datos']).commit();
    return;
  }

  for (const row of rows) {
    const values: any[] = columns.map(col => cellValue(extractField(row.rawData, col)));
    if (includeConfidence) {
      values.push(confidencePercent(row.confidenceScore));
    }
    sheet.addRow(values).commit();
  }
}
