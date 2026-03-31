# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**lector-planos** is a web application that extracts structured data from engineering drawing PDFs ("planos tecnicos") and outputs consolidated Excel files. Deployed on Railway with a frontend for batch PDF uploads (1-200 PDFs per batch).

This is a scalable rewrite of the prototype at `../PDF-Listado-Materiales/`, which uses fixed %-based coordinates + Claude Vision for OCR. The prototype works but is not scalable: coordinates are hardcoded for one drawing format, extraction is interactive (requires Claude Code Vision per region), and there's no web interface.

## Domain Context

- **Planos tecnicos**: Single-page engineering drawings (piping spools) containing tables and a title block. They are rasterized images inside PDFs — no embedded text, OCR doesn't work.
- **Key challenge**: Drawings are not standardized across clients. Table positions, layouts, and field names vary. The prototype solved this with fixed crop coordinates, but every new client format requires manual coordinate tuning.
- **Four data regions per drawing**:
  - **Materiales** (materials list): ITEM, DIAM., CODIGO, DESCRIPCION, CANTIDAD, N COLADA
  - **Soldaduras** (welds): N SOLD., DIAM., TIPO SOLD., WPS, FECHA SOLDADURA, SOLDADOR, FECHA INSP. VISUAL, RESULTADO
  - **Cortes** (cuts): N CORTE, DIAM., LARGO, EXTREMO 1, EXTREMO 2
  - **Cajetin** (title block): OT, OF, tag spool, diameter, client, end client, line

## Architecture Goals (MVP)

- **Backend**: Python API (FastAPI) handling PDF upload, processing pipeline, and Excel generation
- **Frontend**: Web UI for batch PDF upload with processing status
- **Processing pipeline**: PDF -> region detection/cropping -> Vision AI extraction -> validation -> JSON -> Excel
- **Data storage**: Persist all extracted data (not just final Excel) for learning/improvement
- **Deployment**: Railway (containerized)
- **Target**: < 60 seconds from batch upload to Excel-ready output

## Inherited from Prototype

The data models (Pydantic schemas) and Excel generation logic from `../PDF-Listado-Materiales/src/` are reusable:
- `schemas.py`: MaterialRow, SoldaduraRow, CorteRow, CajetinData, SpoolRecord
- `excel.py`: openpyxl-based Excel writer with 3 sheets (Materiales, Soldaduras, Cortes)
- `crop.py`: PyMuPDF region cropping engine (needs to be made adaptive)
- `regions.py`: Fixed %-based coordinates (need to become configurable per client/format)

## Key Technical Decisions (Pending)

- Vision AI provider for table extraction (Claude API, OpenAI, Google)
- Region detection strategy: fixed coordinates vs. adaptive detection vs. user-configurable templates
- Database choice for persisting extracted data and learning from corrections
- Queue system for batch processing within 60s constraint


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
