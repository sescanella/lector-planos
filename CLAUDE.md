# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**lector-planos** is a web application that extracts structured data from engineering drawing PDFs ("planos tecnicos") and outputs consolidated Excel files. Deployed on Railway with a frontend for batch PDF uploads (1-200 PDFs per batch).

This is a scalable rewrite of the prototype at `../PDF-Listado-Materiales/`, which uses fixed %-based coordinates + Claude Vision for OCR. The prototype works but is not scalable: coordinates are hardcoded for one drawing format, extraction is interactive (requires Claude Code Vision per region), and there's no web interface.

## Domain Context

- **Planos tecnicos**: Single-page engineering drawings containing tables and a title block. They are rasterized images inside PDFs — no embedded text, OCR doesn't work.
- **Two drawing families**:
  - **Spool (MK/FastPack, familia_b)**: 1 PDF = 1 spool. Has "TAG SPOOL:" field. Tables: ITEM, DIAM., CODIGO, CANTIDAD. Includes soldaduras + cortes tables.
  - **Isometric (EPC/Centinela, familia_a)**: 1 PDF = N spools. Has "NUMERO ISOMETRICO" field. Tables: PT NO, DIA (IN), CMDTY CODE, CANT. Split into MATERIAL DE TALLER + MATERIAL DE CAMPO + SOPORTES DE PIPING. No soldaduras/cortes.
- **Pre-classification**: `src/services/classify.ts` uses Tesseract OCR on a small title block crop to detect keywords ("TAG SPOOL" vs "NUMERO ISOMETRICO") and classify before the Vision API call. No AI cost.
- **Key challenge**: Drawings are not standardized across clients. Table positions, layouts, and field names vary.
- **Data regions per drawing**:
  - **Materiales** (materials list): ITEM, DIAM., CODIGO, DESCRIPCION, CANTIDAD, N COLADA
  - **Soldaduras** (welds): N SOLD., DIAM., TIPO SOLD., WPS, FECHA SOLDADURA, SOLDADOR, FECHA INSP. VISUAL, RESULTADO (spool only)
  - **Cortes** (cuts): N CORTE, DIAM., LARGO, EXTREMO 1, EXTREMO 2 (spool only)
  - **Cajetin** (title block): OT, OF, tag spool, diameter, client, end client, line

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Runtime** | Node.js 22+ (LTS) |
| **Framework** | Express.js |
| **Language** | TypeScript |
| **Database** | PostgreSQL (Railway-managed) |
| **File Storage** | AWS S3 (`uploads/{job_id}/{file_id}.pdf`) |
| **Job Queue** | BullMQ + Redis (5 parallel workers) |
| **Deployment** | Railway |
| **Dev Tools** | nodemon, ts-node |

## Architecture

- **Backend**: Express API handling PDF upload, job queue orchestration, and Excel generation
- **Frontend**: Web UI for batch PDF upload (1-200 files) with processing status
- **Processing pipeline**: PDF upload → S3 storage → BullMQ job → Tesseract classification → crop → Vision AI extraction → validation → DB persist → Excel export
- **Data storage**: PostgreSQL for all extracted data (spools, materials, unions, cuts, metadata, corrections)
- **Notifications**: Webhook on job completion/failure
- **Target**: < 60 seconds from batch upload to Excel-ready output

## Data Model (key entities)

- **ExtractionJob** → PDFFile (1:many) → Spool (1:many) → Material, Union, Cut, SpoolMetadata
- **Correction**: User feedback linked to Spool for learning from errors
- All entities include `confidence_score` (0-1) from AI extraction

## API Routes

- `POST /api/v1/jobs` — Create extraction job
- `POST /api/v1/jobs/:jobId/upload` — Upload PDFs (1-200, max 50MB each)
- `GET /api/v1/jobs/:jobId` — Job status + file list
- `GET /api/v1/spools/:spoolId` — Extracted spool data
- `POST /api/v1/spools/:spoolId/corrections` — Submit correction
- `GET /` — Hello world (service name, version)
- `GET /health` — Health check (server + DB status)

## Inherited from Prototype

The domain knowledge and extraction logic from `../PDF-Listado-Materiales/src/` informed the BrainGrid requirements:
- Region cropping strategy (now needs to become adaptive per client format)
- Excel output structure: 3 sheets (Materiales, Soldaduras, Cortes)
- Data fields per region (ITEM, DIAM., CODIGO, etc.)

## Bug Registry

See [BUGS.md](./BUGS.md) — read before writing SQL queries, modifying DB updates, or changing the Vision prompt.

## Golden Test Suite

When modifying `src/services/vision.ts` (prompt), `src/services/crop.ts` (crop regions), or `src/services/classify.ts` (classification), run `npm run golden:check` before pushing. This processes PDFs in `tests/golden/` against the Vision API and compares with `.truth.json` ground truth. Fails on regression. Cost: ~$0.04/PDF.

## Key Technical Decisions

- **Vision AI**: Claude API (Sonnet) — decided
- **Region detection**: Fixed %-based crops with overlapping regions — decided
- **Format classification**: Tesseract OCR keyword detection before Vision call — implemented
- **Pending**: Prompt routing per family (use classification result to select optimized prompts/crops per format)


<!-- BEGIN BRAINGRID INTEGRATION -->
## BrainGrid Integration

Spec-driven development: turn ideas into AI-ready tasks.

**Slash Commands:**

| Command                     | Description                   |
| --------------------------- | ----------------------------- |
| `/specify [prompt]`         | Create AI-refined requirement |
| `/build [req-id]`           | Get implementation plan       |
| `/save-requirement [title]` | Save plan as requirement      |

**Workflow:**

```bash
/specify "Add auth"  # → REQ-123
/build REQ-123       # → plan
```

**Task Commands:**

```bash
braingrid task list -r REQ-123      # List tasks
braingrid task show TASK-456        # Show task details
braingrid task update TASK-456 --status COMPLETED
```

**Auto-detection:** Project from `.braingrid/project.json`, requirement from branch (`feature/REQ-123-*`).

**Full documentation:** [.braingrid/README.md](./.braingrid/README.md)

<!-- END BRAINGRID INTEGRATION -->
