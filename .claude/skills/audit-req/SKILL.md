---
name: audit-req
description: Audit a BrainGrid requirement against technical best practices before building. Detects EOL versions, missing deployment steps, security gaps, API convention issues, cross-REQ duplicates, and domain-specific problems (frontend UX, AI/Vision, PDF processing, Excel export). Proposes fixes and optionally updates the REQ in BrainGrid.
allowed-tools: Bash(braingrid:*), Read, Write, Glob, Grep, WebSearch, AskUserQuestion
argument-hint: [requirement-id]
---

Audit a BrainGrid requirement's technical spec before building it. Catches spec-level issues when they are cheapest to fix — before code is written.

## Parse Arguments

1. If $ARGUMENTS starts with REQ-, req-, or a number, use as requirement ID
2. If no ID provided, auto-detect from git branch name
3. If auto-detection fails, ask user for requirement ID

## Step 1: Gather Context

### 1a. Fetch the target REQ

```bash
braingrid requirement show [REQ-ID] --format markdown
```

Save the full output for analysis.

### 1b. Read project standards

Read these files to ground the audit in concrete data:

- `references/tech-standards.md` (this skill's reference — runtime versions, Docker patterns, API conventions, domain-specific rules)
- `CLAUDE.md` (project tech stack and architecture)

### 1c. Classify the REQ type

Scan the REQ content and assign one or more types. This determines which checklist sections apply:

| Type | Trigger keywords/sections |
|------|--------------------------|
| `backend-setup` | server, Express, framework, hello world, foundation |
| `infrastructure` | database, S3, Redis, queue, BullMQ, deployment |
| `frontend` | UI, interface, drag-drop, upload, form, page, component |
| `api` | endpoint, REST, POST, GET, status code, webhook |
| `pdf-processing` | PDF, page extraction, image conversion, DPI |
| `ai-vision` | Vision, Claude API, GPT-4V, extraction, confidence, OCR |
| `excel-export` | Excel, workbook, sheet, export, download |
| `feedback` | correction, feedback, learning, user adjustment |
| `performance` | parallel, concurrency, optimization, latency, batch |

A REQ can have multiple types (e.g., REQ-2 is `infrastructure` + `api`).

### 1d. Cross-REQ duplicate check

```bash
braingrid requirement list --format markdown
```

Check for:
- **Content duplicates**: Two REQs with nearly identical descriptions (e.g., REQ-3/REQ-9, REQ-4/REQ-10)
- **Content mismatch**: A REQ whose title says one thing but content says another (e.g., REQ-8 titled "Optimización de velocidad" but content is about "feedback y correcciones")
- **Status confusion**: IDEA and PLANNED versions of the same feature coexisting

Report duplicates as MAJOR issues.

## Step 2: Run Checklist

For each issue found, record:
- **Category** (which checklist section)
- **Severity**: CRITICAL / MAJOR / MINOR
- **What the REQ says** (quote the problematic text)
- **What it should say** (the fix)
- **Why** (brief justification)

### Severity definitions

- **CRITICAL**: Will cause build failure, security vulnerability, or data loss. Must fix before building.
- **MAJOR**: Will cause significant rework, deployment issues, or divergence from project standards. Should fix before building.
- **MINOR**: Improvement that won't block building. Can be deferred.

---

### A. Runtime & Dependency Versions (all types)

Compare versions in the REQ against `references/tech-standards.md` runtime table.

- Is the specified runtime version still supported?
- Do framework versions match the runtime? (e.g., TypeScript 6.x needs Node 22+)
- Are there version conflicts between dependencies?

If a version is not in the reference table, use `WebSearch` to verify: search `"{runtime} {version} end of life date"`. Do NOT guess.

### B. Deployment & Docker (types: backend-setup, infrastructure)

Check against `references/tech-standards.md` Docker standards:

- Does TypeScript/compiled code use multi-stage build?
- Does the Dockerfile include a build step (`RUN npm run build`)?
- Is `.dockerignore` specified or implied?
- Does `EXPOSE` use a literal number (not variable interpolation)?
- Is graceful shutdown specified? (SIGTERM handling for DB pools, queue workers, HTTP server)
- Are environment variables documented with defaults?

### C. API Design (types: api, backend-setup, infrastructure)

Check against `references/tech-standards.md` HTTP status codes table:

- Do all endpoints use correct HTTP status codes?
- Is error response format consistent across endpoints?
- Are API paths versioned (`/api/v1/...`)?
- Are timestamps ISO 8601 UTC?
- Are IDs UUIDs?

### D. Security (all types with user-facing endpoints)

- Input validation at API boundaries?
- File upload limits (size, type, count)?
- CORS configuration for frontend-backend separation?
- Sensitive env vars excluded from logs?
- HTTPS enforced for webhooks and external calls?

### E. Error Handling & Resilience (types: infrastructure, api, performance)

- Retry strategies with backoff?
- Timeouts for external calls?
- Graceful degradation (server starts without DB)?
- Fatal error handling (unhandled rejections)?
- Dead letter queue for failed jobs?

### F. Project Consistency (all types)

- Does the REQ align with CLAUDE.md tech stack?
- Are naming conventions consistent with other REQs?
- Does this REQ contradict decisions in other REQs?

---

### Conditional Sections (by REQ type)

### G. Frontend & UX (type: frontend)

Read these references for audit criteria:
- `.claude/skills/bg-frontend-design/references/accessibility.md`
- `.claude/skills/bg-ux-design/SKILL.md` (Phase 5: VALIDATE checklist)

Check:
- Are accessibility requirements specified? (WCAG level, keyboard nav, screen reader, contrast)
- Are ALL component states specified? (loading, empty, error, success, disabled)
- Are responsive breakpoints or mobile support mentioned?
- Are edge cases in the UX flow addressed? (empty states, max limits reached, connection lost)
- Is file upload UX fully specified? (selecting → validating → uploading → progress → complete → failed)
- Is browser compatibility mentioned?

### H. PDF Processing (type: pdf-processing)

- Is image conversion DPI specified? (minimum 150 for technical drawings)
- Is memory management addressed for large PDFs?
- Are native dependencies listed? (poppler, ghostscript, pdf-lib, sharp, etc.)
- Is corrupted/encrypted PDF handling specified?
- Are page count limits specified?

### I. AI/Vision Extraction (type: ai-vision)

- Is the AI provider specified? (Claude Vision, GPT-4V, etc.)
- Is there a fallback strategy if the primary provider fails?
- Are rate limits and throttling handled?
- Is cost estimation or budget cap mentioned?
- Are token/context limits for input images addressed?
- Is confidence threshold for acceptable extraction defined?
- Is retry strategy for transient API failures specified?

### J. Excel/Export (type: excel-export)

- Are Excel format limits respected? (sheet name ≤ 31 chars, ≤ 1M rows)
- Is streaming specified for large exports?
- Are sheet naming conventions defined?
- Is download delivery method specified? (API endpoint, presigned URL, webhook)

### K. Performance & Concurrency (type: performance)

- Are performance targets quantified? (latency, throughput, batch size)
- Are benchmarking or profiling strategies mentioned?
- Is concurrency limit specified with rationale?
- Are bottleneck scenarios identified?

---

## Step 3: Report

Present findings in this format:

```
## Audit Report: REQ-{id} — {name}

**Type(s):** {classified types}

### Summary
| Severity | Count |
|----------|-------|
| CRITICAL | {n} |
| MAJOR | {n} |
| MINOR | {n} |

### Cross-REQ Issues
{List any duplicates, content mismatches, or conflicts found in Step 1d}

### Issues

#### CRITICAL
1. **[{Category}]** {description}
   - REQ says: "{quoted text}"
   - Should be: "{corrected text}"
   - Why: {justification}

#### MAJOR
...

#### MINOR
...

### Passed
- {List checklist sections that had no issues}
```

If zero issues: "No issues found. REQ-{id} is ready for `/build`."

## Step 4: Fix

If CRITICAL or MAJOR issues were found:

### 4a. Generate diff

For each issue, show the exact text change:

```diff
- Node.js 18+
+ Node.js 22+ (LTS)
```

### 4b. Write corrected content

Write the corrected REQ content to `.braingrid/temp/REQ-{id}-audited-content.md`. Rules:
- Preserve the original REQ structure and all sections
- Only modify the specific text that has issues
- Do NOT restructure or rewrite sections that are fine

### 4c. Ask user

Ask: "Found {n} CRITICAL and {m} MAJOR issues. Should I update REQ-{id} in BrainGrid with these fixes?"

### 4d. Apply (if approved)

```bash
braingrid requirement update REQ-{id} --content "$(cat .braingrid/temp/REQ-{id}-audited-content.md)"
```

### 4e. Log the audit

Append to `.braingrid/temp/audit-log.md` (create if doesn't exist):

```
## REQ-{id} — {date}
- Type(s): {types}
- Issues: {critical} CRITICAL, {major} MAJOR, {minor} MINOR
- Fixed: {yes/no}
- Key findings: {1-line summary of most important issue}
```

### 4f. Confirm

"REQ-{id} updated. Ready for `/build REQ-{id}`."

If MINOR-only issues were found, report them but do NOT block — say: "MINOR issues found (see report). REQ is ready for `/build`."

## Important Notes

- This audits the SPEC, not code. We review what the REQ says should be built.
- Be pragmatic: don't flag intentional MVP simplifications unless they'll cause real problems.
- Use `references/tech-standards.md` as source of truth — don't rely on memory for versions or conventions.
- When the reference table doesn't cover a runtime/version, use `WebSearch` — don't guess.
- MINOR issues should never block a build. CRITICAL and MAJOR should.
- Keep `references/tech-standards.md` updated when you discover new EOL dates or convention changes.
