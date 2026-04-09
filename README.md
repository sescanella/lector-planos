# Lector de Planos

Web application that extracts structured data from engineering drawing PDFs (piping spools) and outputs consolidated Excel files. Deployed on Railway.

## Tech Stack

- **Backend**: Node.js 22+, Express, TypeScript
- **Database**: PostgreSQL (Railway)
- **Storage**: AWS S3
- **Queue**: BullMQ + Redis (5 parallel workers)
- **Vision AI**: Claude API for table/title block extraction
- **Frontend**: React + Vite (Vercel)

## Prerequisites

- Node.js 22+
- `poppler-utils` — PDF to image conversion (`brew install poppler` / `apk add poppler-utils`)
- `tesseract` — Drawing classification OCR (`brew install tesseract` / `apk add tesseract-ocr`). Optional: app works without it but skips pre-classification.

## Setup

```bash
npm install
cp .env.example .env  # configure DB, S3, Redis, Anthropic API key
npm run dev
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with hot reload |
| `npm run build` | Compile TypeScript |
| `npm start` | Start production server |
| `npm test` | Run unit tests with coverage |
| `npm run golden:check` | Run Vision extraction regression tests |

## Golden Test Suite

Prevents regressions when modifying the Vision extraction prompt or crop regions.

### How it works

1. PDFs in `tests/golden/` are processed through the real crop + Vision API pipeline
2. Results are compared against `.truth.json` ground truth files
3. Any field mismatch = regression = blocked push

### When to run

Run `npm run golden:check` before pushing changes to:
- `src/services/vision.ts` (extraction prompt)
- `src/services/crop.ts` (crop regions)

A Claude Code hook automatically reminds you when these files change.

### Adding a new golden test

1. Place the PDF in `tests/golden/` (e.g., `my-new-format.pdf`)
2. Process it through the app and validate the output manually
3. Create `tests/golden/my-new-format.truth.json`:

```json
{
  "cajetin": {
    "ot": "76400-472031",
    "of": "20832",
    "tagSpool": "MK-1414-PW-13774-002-R",
    "diameter": "8\"",
    "client": "Fluor-Salfa",
    "endClient": "CENTINELA",
    "line": "8\"-PW-1414-LL18-13774",
    "revision": "0"
  },
  "materiales": {
    "count": 3,
    "spot_checks": [
      { "item": "1", "diameter": "8", "code": "5356516RL1", "quantity": "2470 MM" }
    ]
  },
  "soldaduras": { "count": 4, "spot_checks": [] },
  "cortes": { "count": 2, "spot_checks": [] }
}
```

4. Run `npm run golden:check` to verify it passes

### Cost

~$0.04 per PDF per run. Current suite (3 PDFs) costs ~$0.12.

## Bug Registry

See [BUGS.md](./BUGS.md) for known issues and rules to prevent recurrence. Read before modifying SQL queries, DB updates, or the Vision prompt.
