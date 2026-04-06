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
The images are, in order: (1) upper-right tables area, (2) center-right tables area, (3) lower-right tables area, (4) title block (cajetín).

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

RULES:
- Map headers to canonical field names: PT NO→item, DIA (IN)→diameter, CMDTY CODE→code, CANT.→quantity, N COLADA→heatNumber, DIAM.→diameter, CODIGO→code, CANTIDAD→quantity
- If materials split into "MATERIAL DE TALLER" + "MATERIAL DE CAMPO", set source="taller" or "campo" per row
- If a table does not exist in any image, set that section to null (not empty array)
- If a table has headers but zero data rows, set rows=[] and totalRowsDetected=0
- Blank/unfilled fields (common in pre-fabrication drawings) should be null, not empty string
- Confidence per row: 0.9-1.0=clear text, 0.7-0.9=mostly legible, 0.5-0.7=uncertain, <0.5=guessing
- Respond ONLY with valid JSON. No markdown, no explanation, no text before or after the JSON.`;

const STRICT_RETRY_PROMPT = `${EXTRACTION_PROMPT}

CRITICAL: Your previous response was not valid JSON. Respond with ONLY the JSON object. No markdown fences, no explanations, no text before or after. Start with { and end with }.`;

// ── Circuit breaker ─────────────────────────────────────────────────────────

const CIRCUIT_BREAKER_THRESHOLD = 5;
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

  let maxTokens = env.VISION_MAX_TOKENS;
  let prompt = EXTRACTION_PROMPT;
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
          prompt = STRICT_RETRY_PROMPT;
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
          prompt = STRICT_RETRY_PROMPT;
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
