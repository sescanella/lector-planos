import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env';

// ── Types ──────────────────────────────────────────────────────────────────

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

export interface WeldRow {
  weldNumber: string;
  diameter: string;
  weldType: string;
  wps: string;
  weldDate: string | null;
  welder: string | null;
  inspectionDate: string | null;
  result: string | null;
  confidence: number;
}

export interface CutRow {
  cutNumber: string;
  diameter: string;
  length: string;
  end1: string;
  end2: string;
  confidence: number;
}

export interface CajetinData {
  ot: string | null;
  of: string | null;
  tagSpool: string | null;
  diameter: string | null;
  client: string | null;
  endClient: string | null;
  line: string | null;
  revision: string | null;
  confidence: number;
}

export interface VisionExtractionResult {
  materiales: {
    rows: MaterialRow[];
    rawHeaders: string[];
    totalRowsDetected: number;
    confidence: number;
    source?: 'single' | 'taller_campo';
  } | null;
  soldaduras: {
    rows: WeldRow[];
    rawHeaders: string[];
    totalRowsDetected: number;
    confidence: number;
  } | null;
  cortes: {
    rows: CutRow[];
    rawHeaders: string[];
    totalRowsDetected: number;
    confidence: number;
  } | null;
  cajetin: CajetinData;
  drawingFormat: {
    paperSize: string;
    orientation: string;
    familyHint: string;
  };
  overallConfidence: number;
}

// ── Error types ────────────────────────────────────────────────────────────

export class VisionRetryableError extends Error {
  constructor(message: string, public readonly retryAfterMs?: number) {
    super(message);
    this.name = 'VisionRetryableError';
  }
}

export class VisionFatalError extends Error {
  constructor(message: string, public readonly shouldPauseQueue: boolean = false) {
    super(message);
    this.name = 'VisionFatalError';
  }
}

// ── Prompt ──────────────────────────────────────────────────────────────────

const EXTRACTION_PROMPT = `You are analyzing 4 cropped regions from a single engineering spool drawing (plano técnico de piping).
The images are, in order: (1) upper-right tables area, (2) center-right tables area, (3) lower-right tables area, (4) full bottom strip including OT/OF line and title block (cajetín).

These crops OVERLAP — a table row may appear in more than one image. Extract each row EXACTLY ONCE.

From these images, extract ALL structured data into this JSON schema:

{
  "materiales": {
    "rows": [{ "item": "", "diameter": "", "code": "", "description": "", "quantity": "", "heatNumber": null, "source": "taller|campo|null", "confidence": 0.0 }],
    "rawHeaders": ["exact column headers as seen"],
    "totalRowsDetected": 0,
    "confidence": 0.0,
    "source": "single|taller_campo"
  },
  "soldaduras": {
    "rows": [{ "weldNumber": "", "diameter": "", "weldType": "", "wps": "", "weldDate": null, "welder": null, "inspectionDate": null, "result": null, "confidence": 0.0 }],
    "rawHeaders": [],
    "totalRowsDetected": 0,
    "confidence": 0.0
  } | null,
  "cortes": {
    "rows": [{ "cutNumber": "", "diameter": "", "length": "", "end1": "", "end2": "", "confidence": 0.0 }],
    "rawHeaders": [],
    "totalRowsDetected": 0,
    "confidence": 0.0
  } | null,
  "cajetin": { "ot": null, "of": null, "tagSpool": null, "diameter": null, "client": null, "endClient": null, "line": null, "revision": null, "confidence": 0.0 },
  "drawingFormat": { "paperSize": "A3|Tabloid|A1|Letter", "orientation": "landscape|portrait", "familyHint": "EPC/Centinela|MK/FastPack|Besalco/FP|unknown" },
  "overallConfidence": 0.0
}

TABLE RULES:
- Map headers to canonical field names: PT NO→item, DIA (IN)→diameter, CMDTY CODE→code, CANT.→quantity, N COLADA→heatNumber, DIAM.→diameter, CODIGO→code, CANTIDAD→quantity
- If materials split into "MATERIAL DE TALLER" + "MATERIAL DE CAMPO", set source="taller" or "campo" per row
- Sections labeled "SOPORTES DE PIPING" or "INSTRUMENTOS" are ALSO materials — include them in the materiales rows with source=null
- If a table does not exist in any image, set that section to null (not empty array)
- If a table has headers but zero data rows, set rows=[] and totalRowsDetected=0
- Blank/unfilled fields (common in pre-fabrication drawings) should be null, not empty string

CAJETÍN (TITLE BLOCK) RULES — use image (4) only:
- ot: The field labeled "OT:", "N° OT", or "ORDEN DE TRABAJO" — a numeric/alphanumeric code, typically format "76400-XXXXXX" or similar. It is NOT the "REFERENCIA P&ID" (which looks like "1002-03-ID-EPC-..."). It is NOT the "ORDEN DE COMPRA". If no such field exists in the drawing (e.g. EPC/Centinela format), set to null.
- of: The field labeled "OF:", "N° OF", or "ORDEN DE FABRICACIÓN" — a short numeric code (4-6 digits, e.g. "20832"). It is NOT "NOTA DE VENTA" and NOT "ORDEN DE COMPRA". If no such field exists in the drawing (e.g. EPC/Centinela format), set to null.
- tagSpool: The spool identifier. For MK/FastPack drawings: labeled "TAG SPOOL:" (e.g. "MK-1414-TA-29675-001-R"). For EPC/Centinela isometric drawings: look for the "MARCA DE PIEZA" section — list ALL spool marks separated by commas (e.g. "MK-1322-SL-22633-001, MK-1322-SL-22633-002"). A single isometric may contain 2-11 spools.
- diameter: ONLY the nominal pipe size as a number with inch symbol (e.g. "3\"", "8\"", "12\""). Always include the inch symbol. Output '3"' not '3', '12"' not '12'. Extract from the "N° LÍNEA", "LÍNEA", or "NUMERO DE LINEA" prefix if no separate diameter field exists. NEVER include the full line designation.
- line: The FULL line designation string (e.g. "3\"-TA-1414-SR2-29675", "12\"-PW-1251-LL18-20984"). This is the "N° LÍNEA", "LÍNEA", or "NUMERO DE LINEA" field.
- client: The main contractor, labeled "CLIENTE" or visible in the logo area (e.g. "Fluor-Salfa"). For EPC/Centinela: look for "CONTRATO" field or project name (e.g. "ANTOFAGASTA MINERALS", "D3MC").
- endClient: The end/final client, labeled "CLIENTE FINAL" or "PROPIETARIO" (e.g. "CENTINELA"). For EPC/Centinela: the project/mine name if visible (e.g. "CENTINELA").
- revision: The CURRENT/LATEST revision number, usually "0", "1", "A", "B" — found in the revision block. If multiple revisions exist, take the most recent one.

GENERAL RULES:
- Confidence per row: 0.9-1.0=clear text, 0.7-0.9=mostly legible, 0.5-0.7=uncertain, <0.5=guessing
- Respond ONLY with valid JSON. No markdown, no explanation, no text before or after the JSON.`;

/** Isometric-specific prompt: no soldaduras/cortes (validated: never exist in isometric drawings). */
const ISOMETRIC_EXTRACTION_PROMPT = `You are analyzing 4 cropped regions from a single engineering isometric drawing (plano isométrico de piping).
The images are, in order: (1) upper-right tables area, (2) center-right tables area, (3) lower-right tables area, (4) full bottom strip including title block (cajetín).

These crops OVERLAP — a table row may appear in more than one image. Extract each row EXACTLY ONCE.

This is an ISOMETRIC drawing — it contains material lists only (no weld or cut tables). Set soldaduras and cortes to null.

From these images, extract ALL structured data into this JSON schema:

{
  "materiales": {
    "rows": [{ "item": "", "diameter": "", "code": "", "description": "", "quantity": "", "heatNumber": null, "source": "taller|campo|null", "confidence": 0.0 }],
    "rawHeaders": ["exact column headers as seen"],
    "totalRowsDetected": 0,
    "confidence": 0.0,
    "source": "single|taller_campo"
  },
  "soldaduras": null,
  "cortes": null,
  "cajetin": { "ot": null, "of": null, "tagSpool": null, "diameter": null, "client": null, "endClient": null, "line": null, "revision": null, "confidence": 0.0 },
  "drawingFormat": { "paperSize": "A3|Tabloid|A1|Letter", "orientation": "landscape|portrait", "familyHint": "EPC/Centinela|MK/FastPack|Besalco/FP|unknown" },
  "overallConfidence": 0.0
}

TABLE RULES:
- Map headers to canonical field names: PT NO→item, DIA (IN)→diameter, CMDTY CODE→code, CANT.→quantity, N COLADA→heatNumber, DIAM.→diameter, CODIGO→code, CANTIDAD→quantity
- If materials split into "MATERIAL DE TALLER" + "MATERIAL DE CAMPO", set source="taller" or "campo" per row
- Sections labeled "SOPORTES DE PIPING" or "INSTRUMENTOS" are ALSO materials — include them in the materiales rows with source=null
- If a table does not exist in any image, set that section to null (not empty array)
- If a table has headers but zero data rows, set rows=[] and totalRowsDetected=0
- Blank/unfilled fields (common in pre-fabrication drawings) should be null, not empty string

CAJETÍN (TITLE BLOCK) RULES — use image (4) only:
- ot: null (isometric drawings do not have OT field)
- of: null (isometric drawings do not have OF field)
- tagSpool: Look for "MARCA DE PIEZA" section in the materials area (images 1-2, below materials table). List ALL spool marks separated by commas (e.g. "MK-1322-SL-22633-001, MK-1322-SL-22633-002"). A single isometric may contain 2-11 spools.
- diameter: ONLY the nominal pipe size as a number with inch symbol (e.g. "3\"", "8\"", "12\""). Always include the inch symbol. Output '3"' not '3', '12"' not '12'. Extract from the "NUMERO DE LINEA" prefix. NEVER include the full line designation.
- line: The FULL line designation string (e.g. "3\"-SL-1322-SR2-22633", "12\"-PW-1251-LL18-20984"). This is the "NUMERO DE LINEA" field.
- client: Look for "CONTRATO" field or project name (e.g. "ANTOFAGASTA MINERALS", "D3MC").
- endClient: The project/mine name if visible (e.g. "CENTINELA").
- revision: The CURRENT/LATEST revision number, usually "0", "1", "A", "B" — found in the revision block. If multiple revisions exist, take the most recent one.

GENERAL RULES:
- Confidence per row: 0.9-1.0=clear text, 0.7-0.9=mostly legible, 0.5-0.7=uncertain, <0.5=guessing
- Respond ONLY with valid JSON. No markdown, no explanation, no text before or after the JSON.`;

const STRICT_RETRY_SUFFIX = `\n\nCRITICAL: Your previous response was not valid JSON. Respond with ONLY the JSON object. No markdown fences, no explanations, no text before or after. Start with { and end with }.`;

// ── Circuit breaker ─────────────────────────────────────────────────────────

const CIRCUIT_BREAKER_THRESHOLD = 3;
const CIRCUIT_BREAKER_WINDOW_MS = 60_000;
const CIRCUIT_BREAKER_COOLDOWN_MS = 2 * 60_000;

let failureTimestamps: number[] = [];
let circuitOpenUntil = 0;

function recordFailure(): boolean {
  const now = Date.now();
  failureTimestamps.push(now);
  failureTimestamps = failureTimestamps.filter(t => now - t < CIRCUIT_BREAKER_WINDOW_MS);

  if (failureTimestamps.length >= CIRCUIT_BREAKER_THRESHOLD) {
    circuitOpenUntil = now + CIRCUIT_BREAKER_COOLDOWN_MS;
    failureTimestamps = [];
    console.error('ALERT: Vision API circuit breaker OPEN — pausing for 2 minutes');
    return true;
  }
  return false;
}

function recordSuccess(): void {
  failureTimestamps = [];
}

function isCircuitOpen(): boolean {
  return Date.now() < circuitOpenUntil;
}

// ── SDK client (singleton) ─────────────────────────────────────────────────

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({
      apiKey: env.ANTHROPIC_API_KEY,
      timeout: env.VISION_TIMEOUT_MS,
    });
  }
  return client;
}

// ── JSON parsing with fallback chain ────────────────────────────────────────

export function parseVisionResponse(rawText: string): VisionExtractionResult {
  // 1. Direct JSON.parse
  try {
    const parsed = JSON.parse(rawText);
    validateVisionResponse(parsed);
    return parsed;
  } catch { /* fall through */ }

  // 2. Extract from markdown code fences
  const fenceMatch = rawText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    try {
      const parsed = JSON.parse(fenceMatch[1]);
      validateVisionResponse(parsed);
      return parsed;
    } catch { /* fall through */ }
  }

  // 3. Regex for outermost {...} block
  const braceMatch = rawText.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try {
      const parsed = JSON.parse(braceMatch[0]);
      validateVisionResponse(parsed);
      return parsed;
    } catch { /* fall through */ }
  }

  throw new Error('Failed to parse Vision API response as JSON after all fallback attempts');
}

function validateVisionResponse(data: unknown): asserts data is VisionExtractionResult {
  if (!data || typeof data !== 'object') throw new Error('Invalid vision response: not an object');
  if (!('overallConfidence' in data)) throw new Error('Invalid vision response: missing overallConfidence');
  if (!('cajetin' in data)) throw new Error('Invalid vision response: missing cajetin');
  if (!('drawingFormat' in data)) throw new Error('Invalid vision response: missing drawingFormat');
}

// ── Core extraction function ────────────────────────────────────────────────

export interface VisionUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface ExtractFromCropsResult {
  data: VisionExtractionResult;
  usage: VisionUsage;
}

/**
 * Send 4 crop images to Claude Vision and extract structured data.
 * Expected crop keys: 'right_upper', 'right_center', 'right_lower', 'cajetin_titleblk'
 */
export async function extractFromCrops(
  crops: Map<string, Buffer>,
  family?: 'spool' | 'isometric' | 'unknown',
): Promise<ExtractFromCropsResult> {
  if (isCircuitOpen()) {
    throw new VisionRetryableError(
      'Vision API circuit breaker is open — retrying after cooldown',
      CIRCUIT_BREAKER_COOLDOWN_MS,
    );
  }

  const cropOrder = ['right_upper', 'right_center', 'right_lower', 'cajetin_titleblk'];
  for (const key of cropOrder) {
    if (!crops.has(key)) {
      throw new VisionFatalError(`Missing required crop: ${key}`);
    }
  }

  const basePrompt = (family === 'isometric') ? ISOMETRIC_EXTRACTION_PROMPT : EXTRACTION_PROMPT;
  let maxTokens = env.VISION_MAX_TOKENS;
  let prompt = basePrompt;
  let attempts = 0;
  const MAX_ATTEMPTS = 2;

  while (attempts < MAX_ATTEMPTS) {
    attempts++;

    const imageContent = cropOrder.map(key => ({
      type: 'image' as const,
      source: {
        type: 'base64' as const,
        media_type: 'image/png' as const,
        data: crops.get(key)!.toString('base64'),
      },
    }));

    try {
      const response = await getClient().messages.create({
        model: env.VISION_MODEL,
        max_tokens: maxTokens,
        messages: [{
          role: 'user',
          content: [
            ...imageContent,
            { type: 'text', text: prompt },
          ],
        }],
      });

      // Handle max_tokens truncation
      if (response.stop_reason === 'max_tokens') {
        const newMax = Math.min(Math.round(maxTokens * 1.5), 16384);
        if (newMax > maxTokens && attempts < MAX_ATTEMPTS) {
          console.warn(`Vision response truncated (max_tokens=${maxTokens}), retrying with ${newMax}`);
          maxTokens = newMax;
          prompt = basePrompt + STRICT_RETRY_SUFFIX;
          continue;
        }
      }

      const textBlock = response.content.find(b => b.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        throw new Error('No text content in Vision API response');
      }

      const rawText = textBlock.text;

      // Calculate cost: Sonnet pricing $3/MTok input, $15/MTok output
      const inputTokens = response.usage.input_tokens;
      const outputTokens = response.usage.output_tokens;
      const costUsd = (inputTokens * 3 + outputTokens * 15) / 1_000_000;

      let data: VisionExtractionResult;
      try {
        data = parseVisionResponse(rawText);
      } catch (parseErr) {
        // On parse failure, retry with stricter prompt
        if (attempts < MAX_ATTEMPTS) {
          console.warn('Vision response JSON parse failed, retrying with strict prompt');
          prompt = basePrompt + STRICT_RETRY_SUFFIX;
          continue;
        }
        throw parseErr;
      }

      recordSuccess();
      return { data, usage: { inputTokens, outputTokens, costUsd } };

    } catch (err) {
      if (err instanceof VisionFatalError || err instanceof VisionRetryableError) {
        throw err;
      }

      const error = err as Error & { status?: number; error?: { type?: string } };
      const status = error.status;

      if (status === 401 || status === 403) {
        // Do NOT recordFailure() — auth errors are not transient and should not
        // pollute the circuit breaker state
        throw new VisionFatalError(
          `Vision API auth error (${status}): ${error.message}`,
          true,
        );
      }

      if (status === 400) {
        throw new VisionFatalError(`Vision API bad request: ${error.message}`);
      }

      if (status === 429) {
        const opened = recordFailure();
        throw new VisionRetryableError(
          `Vision API rate limited (429): ${error.message}`,
          opened ? CIRCUIT_BREAKER_COOLDOWN_MS : 30_000,
        );
      }

      if (status === 503 || status === 529) {
        recordFailure();
        throw new VisionRetryableError(
          `Vision API overloaded (${status}): ${error.message}`,
        );
      }

      // Network/timeout/unknown errors
      recordFailure();
      throw new VisionRetryableError(
        `Vision API error: ${error.message}`,
      );
    }
  }

  // Should not reach here, but safety fallback
  throw new VisionRetryableError('Vision API extraction failed after all attempts');
}
