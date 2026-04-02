/**
 * E2E pipeline test: PDF → crop → Vision API → normalize → validate
 * Runs locally without S3/Postgres/Redis — directly on sample PDFs.
 *
 * Usage: npx ts-node scripts/test-pipeline.ts [pdf_path] [page_number]
 * Default: tests one PDF from each family (EPC, MK, FP)
 */

import * as path from 'path';
import * as fs from 'fs';
import { cropRegionsFromPdf } from '../src/services/crop';
import { extractFromCrops } from '../src/services/vision';
import { detectFamily, normalizeMaterialRow, deduplicateRows, deduplicateWeldRows, deduplicateCutRows } from '../src/services/normalizer';

// ── Config ──────────────────────────────────────────────────────────────────

const SAMPLES_DIR = path.resolve(__dirname, '..', 'samples');

const TEST_PDFS = [
  { file: '1002-03-ID-EPC-002-1344-P-IS-27120-01_0.PDF', family: 'EPC/Centinela', page: 1 },
  { file: 'MK-1411-VT-13600-002_1.pdf', family: 'MK/FastPack', page: 1 },
  { file: 'FP-76075-ITF-PP-PL-0489_Rev0.pdf', family: 'Besalco/FP', page: 1 },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function printTable(label: string, rows: any[]) {
  console.log(`\n  ${label} (${rows.length} rows):`);
  if (rows.length === 0) { console.log('    (empty)'); return; }
  // Print first 5 rows
  for (const row of rows.slice(0, 5)) {
    const conf = row.confidence?.toFixed(2) ?? '?';
    const summary = Object.entries(row)
      .filter(([k]) => k !== 'confidence')
      .map(([k, v]) => `${k}=${v ?? '∅'}`)
      .join(' | ');
    console.log(`    [${conf}] ${summary}`);
  }
  if (rows.length > 5) console.log(`    ... +${rows.length - 5} more`);
}

// ── Main ────────────────────────────────────────────────────────────────────

async function testPdf(pdfPath: string, pageNumber: number, expectedFamily: string) {
  const filename = path.basename(pdfPath);
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`📄 ${filename} (page ${pageNumber}) — expected: ${expectedFamily}`);
  console.log('═'.repeat(70));

  // 1. Crop
  console.log('\n1. Cropping 4 regions...');
  const t0 = Date.now();
  const crops = await cropRegionsFromPdf(pdfPath, pageNumber);
  const cropMs = Date.now() - t0;
  console.log(`   Done in ${cropMs}ms — ${crops.size} crops`);
  for (const [id, buf] of crops) {
    console.log(`   ${id}: ${(buf.length / 1024).toFixed(0)} KB`);
  }

  // 2. Vision API
  console.log('\n2. Calling Claude Vision API...');
  const t1 = Date.now();
  const result = await extractFromCrops(crops);
  const visionMs = Date.now() - t1;
  console.log(`   Done in ${visionMs}ms — cost: $${result.usage.costUsd.toFixed(4)}`);
  console.log(`   Tokens: ${result.usage.inputTokens} in / ${result.usage.outputTokens} out`);

  const data = result.data;

  // 3. Format detection
  console.log('\n3. Drawing format:');
  console.log(`   Paper: ${data.drawingFormat.paperSize}, Orientation: ${data.drawingFormat.orientation}`);
  console.log(`   Family hint: ${data.drawingFormat.familyHint}`);
  console.log(`   Overall confidence: ${data.overallConfidence.toFixed(2)}`);

  // 4. Family detection via normalizer
  if (data.materiales && data.materiales.rawHeaders.length > 0) {
    const detected = detectFamily(data.materiales.rawHeaders, data.drawingFormat.familyHint);
    console.log(`   Detected family: ${detected} (from headers + hint)`);
    const match = detected.toLowerCase().includes(expectedFamily.split('/')[0].toLowerCase());
    console.log(`   Match expected? ${match ? 'YES' : 'NO ⚠️'}`);
  }

  // 5. Cajetin
  console.log('\n4. Cajetin (title block):');
  const c = data.cajetin;
  console.log(`   OT: ${c.ot ?? '∅'} | OF: ${c.of ?? '∅'} | Tag: ${c.tagSpool ?? '∅'}`);
  console.log(`   Diam: ${c.diameter ?? '∅'} | Client: ${c.client ?? '∅'} | End client: ${c.endClient ?? '∅'}`);
  console.log(`   Line: ${c.line ?? '∅'} | Rev: ${c.revision ?? '∅'} | Confidence: ${c.confidence.toFixed(2)}`);

  // 6. Tables
  console.log('\n5. Extracted tables:');

  if (data.materiales) {
    const deduped = deduplicateRows(data.materiales.rows);
    printTable(`Materiales (raw headers: ${data.materiales.rawHeaders.join(', ')})`, deduped);
  } else {
    console.log('  Materiales: null');
  }

  if (data.soldaduras) {
    const deduped = deduplicateWeldRows(data.soldaduras.rows);
    printTable('Soldaduras', deduped);
  } else {
    console.log('  Soldaduras: null');
  }

  if (data.cortes) {
    const deduped = deduplicateCutRows(data.cortes.rows);
    printTable('Cortes', deduped);
  } else {
    console.log('  Cortes: null');
  }

  // 7. Summary
  const totalRows = (data.materiales?.rows.length ?? 0) + (data.soldaduras?.rows.length ?? 0) + (data.cortes?.rows.length ?? 0);
  console.log(`\n6. Summary:`);
  console.log(`   Total rows: ${totalRows}`);
  console.log(`   Crop time: ${cropMs}ms | Vision time: ${visionMs}ms | Total: ${cropMs + visionMs}ms`);
  console.log(`   Cost: $${result.usage.costUsd.toFixed(4)}`);

  return {
    file: filename,
    family: expectedFamily,
    confidence: data.overallConfidence,
    totalRows,
    cropMs,
    visionMs,
    cost: result.usage.costUsd,
    tagSpool: data.cajetin.tagSpool,
  };
}

async function main() {
  const args = process.argv.slice(2);

  let pdfsToTest: { file: string; family: string; page: number }[];

  if (args.length >= 1) {
    // Single PDF mode
    const pdfPath = args[0];
    const page = parseInt(args[1] || '1', 10);
    pdfsToTest = [{ file: path.resolve(pdfPath), family: 'unknown', page }];
  } else {
    // Default: test one from each family
    pdfsToTest = TEST_PDFS.map(t => ({
      ...t,
      file: path.join(SAMPLES_DIR, t.file),
    }));
  }

  // Verify files exist
  for (const { file } of pdfsToTest) {
    if (!fs.existsSync(file)) {
      console.error(`File not found: ${file}`);
      process.exit(1);
    }
  }

  console.log(`\nTesting ${pdfsToTest.length} PDF(s)...\n`);

  const results = [];
  let totalCost = 0;

  for (const { file, family, page } of pdfsToTest) {
    try {
      const r = await testPdf(file, page, family);
      results.push(r);
      totalCost += r.cost;
    } catch (err) {
      console.error(`\n❌ FAILED: ${path.basename(file)}`);
      console.error(`   ${(err as Error).message}`);
      results.push({ file: path.basename(file), family, error: (err as Error).message });
    }
  }

  // Final summary
  console.log(`\n${'═'.repeat(70)}`);
  console.log('FINAL SUMMARY');
  console.log('═'.repeat(70));
  console.log(`\nPDFs tested: ${results.length}`);
  console.log(`Total cost: $${totalCost.toFixed(4)}`);
  console.log('');

  for (const r of results) {
    if ('error' in r) {
      console.log(`  ❌ ${r.file} (${r.family}): ${r.error}`);
    } else {
      console.log(`  ✅ ${r.file} — conf: ${r.confidence.toFixed(2)}, rows: ${r.totalRows}, tag: ${r.tagSpool ?? '∅'}, ${r.cropMs + r.visionMs}ms, $${r.cost.toFixed(4)}`);
    }
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
