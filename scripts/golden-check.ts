#!/usr/bin/env npx ts-node
/**
 * Golden Test Suite — regression check for Vision extraction.
 *
 * Runs each PDF in tests/golden/ through the crop + Vision pipeline,
 * then compares the result against the .truth.json ground truth.
 *
 * Usage: npm run golden:check
 * Cost:  ~$0.04 per PDF (~$0.12-0.20 total for current suite)
 * Time:  ~30-60s per PDF
 */

import * as fs from 'fs';
import * as path from 'path';
import { cropRegionsFromPdf } from '../src/services/crop';
import { extractFromCrops, type VisionExtractionResult } from '../src/services/vision';

// ── Types ────────────────────────────────────────────────────────────────────

interface SpotCheck {
  [key: string]: string;
}

interface SectionTruth {
  count: number;
  spot_checks: SpotCheck[];
}

interface GoldenTruth {
  cajetin: Record<string, string>;
  materiales?: SectionTruth;
  soldaduras?: SectionTruth;
  cortes?: SectionTruth;
}

interface FieldResult {
  field: string;
  expected: string;
  actual: string | null;
  pass: boolean;
}

interface PdfResult {
  name: string;
  fields: FieldResult[];
  passed: number;
  failed: number;
  costUsd: number;
}

// ── Colors ───────────────────────────────────────────────────────────────────

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

// ── Comparison logic ─────────────────────────────────────────────────────────

function normalize(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val).trim().toLowerCase().replace(/["''″]/g, '').replace(/×/g, 'x');
}

function compareField(field: string, expected: string, actual: unknown): FieldResult {
  const norm_expected = normalize(expected);
  const norm_actual = normalize(actual);
  return {
    field,
    expected,
    actual: actual == null ? null : String(actual),
    pass: norm_expected === norm_actual,
  };
}

function compareCajetin(truth: Record<string, string>, data: VisionExtractionResult): FieldResult[] {
  const results: FieldResult[] = [];
  for (const [key, expected] of Object.entries(truth)) {
    const actual = (data.cajetin as unknown as Record<string, unknown>)[key];
    results.push(compareField(`cajetin.${key}`, expected, actual));
  }
  return results;
}

function compareSection(
  sectionName: string,
  truth: SectionTruth | undefined,
  rows: Array<Record<string, unknown>> | null,
): FieldResult[] {
  if (!truth) return [];
  const results: FieldResult[] = [];
  const actualCount = rows?.length ?? 0;

  results.push(compareField(
    `${sectionName}.count`,
    String(truth.count),
    String(actualCount),
  ));

  if (truth.spot_checks && rows) {
    for (const check of truth.spot_checks) {
      // Find matching row by first field in spot check
      const firstKey = Object.keys(check)[0];
      const firstVal = check[firstKey];
      const matchingRow = rows.find(r => normalize(r[firstKey]) === normalize(firstVal));

      if (!matchingRow) {
        for (const [key, val] of Object.entries(check)) {
          results.push({
            field: `${sectionName}[${firstKey}=${firstVal}].${key}`,
            expected: val,
            actual: null,
            pass: false,
          });
        }
        continue;
      }

      for (const [key, expected] of Object.entries(check)) {
        results.push(compareField(
          `${sectionName}[${firstKey}=${firstVal}].${key}`,
          expected,
          matchingRow[key],
        ));
      }
    }
  }

  return results;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const goldenDir = path.join(__dirname, '..', 'tests', 'golden');

  // Find all truth files
  const truthFiles = fs.readdirSync(goldenDir)
    .filter(f => f.endsWith('.truth.json'))
    .sort();

  if (truthFiles.length === 0) {
    console.error(`${RED}No .truth.json files found in ${goldenDir}${RESET}`);
    process.exit(1);
  }

  console.log(`\n${BOLD}Golden Check — ${truthFiles.length} PDFs${RESET}\n`);

  const allResults: PdfResult[] = [];
  let totalCost = 0;

  for (const truthFile of truthFiles) {
    const baseName = truthFile.replace('.truth.json', '');
    const pdfPath = path.join(goldenDir, `${baseName}.pdf`);
    const truthPath = path.join(goldenDir, truthFile);

    if (!fs.existsSync(pdfPath)) {
      console.error(`${RED}  Missing PDF: ${pdfPath}${RESET}`);
      continue;
    }

    const truth: GoldenTruth = JSON.parse(fs.readFileSync(truthPath, 'utf-8'));

    process.stdout.write(`  ${baseName} ... `);

    try {
      // Run the actual extraction pipeline
      const crops = await cropRegionsFromPdf(pdfPath, 1);
      const { data, usage } = await extractFromCrops(crops);
      totalCost += usage.costUsd;

      // Compare results
      const fields: FieldResult[] = [
        ...compareCajetin(truth.cajetin, data),
        ...compareSection('materiales', truth.materiales,
          data.materiales?.rows as unknown as Record<string, unknown>[] ?? null),
        ...compareSection('soldaduras', truth.soldaduras,
          data.soldaduras?.rows as unknown as Record<string, unknown>[] ?? null),
        ...compareSection('cortes', truth.cortes,
          data.cortes?.rows as unknown as Record<string, unknown>[] ?? null),
      ];

      const passed = fields.filter(f => f.pass).length;
      const failed = fields.filter(f => !f.pass).length;

      allResults.push({ name: baseName, fields, passed, failed, costUsd: usage.costUsd });

      if (failed === 0) {
        console.log(`${GREEN}PASS${RESET} ${DIM}(${passed}/${passed + failed} fields, $${usage.costUsd.toFixed(3)})${RESET}`);
      } else {
        console.log(`${RED}FAIL${RESET} (${passed}/${passed + failed} fields, $${usage.costUsd.toFixed(3)})`);
        for (const f of fields.filter(f => !f.pass)) {
          console.log(`    ${RED}✗${RESET} ${f.field}: expected ${YELLOW}${f.expected}${RESET} got ${RED}${f.actual ?? 'null'}${RESET}`);
        }
      }

    } catch (err) {
      console.log(`${RED}ERROR${RESET}: ${(err as Error).message}`);
      allResults.push({ name: baseName, fields: [], passed: 0, failed: 1, costUsd: 0 });
    }
  }

  // Summary
  const totalPassed = allResults.filter(r => r.failed === 0).length;
  const totalFailed = allResults.filter(r => r.failed > 0).length;
  const totalFields = allResults.reduce((s, r) => s + r.passed + r.failed, 0);
  const passedFields = allResults.reduce((s, r) => s + r.passed, 0);

  console.log(`\n${BOLD}Results:${RESET} ${totalPassed} PDFs passed, ${totalFailed} failed`);
  console.log(`${BOLD}Fields:${RESET}  ${passedFields}/${totalFields} correct`);
  console.log(`${BOLD}Cost:${RESET}    $${totalCost.toFixed(3)}\n`);

  if (totalFailed > 0) {
    console.log(`${RED}${BOLD}REGRESSION DETECTED — do not push.${RESET}\n`);
    process.exit(1);
  } else {
    console.log(`${GREEN}${BOLD}All golden tests passed — safe to push.${RESET}\n`);
    process.exit(0);
  }
}

main().catch(err => {
  console.error(`${RED}Fatal error: ${err.message}${RESET}`);
  process.exit(1);
});
