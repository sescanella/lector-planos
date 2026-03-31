# Tech Standards Reference

Concrete, verifiable standards for auditing REQs. Update this file as standards change.

## Runtime Versions (as of 2026-03)

| Runtime | Minimum | Recommended | EOL versions |
|---------|---------|-------------|--------------|
| Node.js | 20 | 22 (LTS) | 14, 16, 18, 19, 21 |
| Python | 3.10 | 3.12+ | 2.x, 3.7, 3.8, 3.9 |
| Go | 1.21 | 1.22+ | < 1.21 |
| Java | 17 | 21 (LTS) | 8, 11 (approaching) |

If a REQ specifies a version not in this table, use WebSearch to verify EOL status.

## Docker Standards

### TypeScript / Compiled Languages
MUST use multi-stage build:
```dockerfile
FROM node:{version}-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

FROM node:{version}-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
CMD ["node", "dist/index.js"]
```

### Required files
- `.dockerignore` (exclude node_modules, .git, *.md, .env)
- `EXPOSE` must use literal port number, not variable interpolation

### Graceful shutdown
REQ MUST specify SIGTERM/SIGINT handling for:
- Database connection pools
- Job queue workers (e.g., BullMQ worker.close())
- HTTP server (server.close())

## HTTP Status Codes

| Scenario | Correct Code | Common Mistake |
|----------|-------------|----------------|
| Health check OK | 200 | - |
| Health check degraded | 503 | 200 with degraded body |
| Resource created | 201 | 200 |
| Async job accepted | 202 | 200 or 201 |
| Validation error | 400 | 500 |
| Not found | 404 | 200 with empty body |
| Conflict (e.g., duplicate) | 409 | 400 |
| File too large | 413 | 400 |
| Wrong content type | 415 | 400 |
| Server error | 500 | - |

## API Conventions

- All API paths MUST be versioned: `/api/v1/...`
- Error response format MUST be consistent across all endpoints
- Timestamps MUST be ISO 8601 UTC
- IDs SHOULD be UUIDs

## Security Minimums

- File uploads: MUST specify max size, allowed types, max count
- CORS: MUST be configured when frontend and backend are separate origins
- Webhooks: MUST use HTTPS
- Env vars: sensitive values (API keys, DB URLs) MUST NOT appear in logs
- Input validation: MUST validate at API boundary (request body, query params, path params)

## Infrastructure Patterns

### Database (PostgreSQL)
- Connection pooling MUST specify max connections
- MUST handle connection failures gracefully (server starts in degraded mode)
- MUST specify index strategy for foreign keys and frequently queried columns

### Job Queues (BullMQ/Redis)
- MUST specify concurrency limit
- MUST specify retry policy with backoff strategy
- MUST specify job timeout
- MUST specify dead letter queue or failure handling
- MUST specify graceful shutdown (drain queue before exit)

### File Storage (S3)
- MUST specify bucket naming and folder structure
- MUST specify lifecycle/retention policy
- MUST specify access control (IAM, not public)
- SHOULD specify multipart upload threshold

## Excel/Export Limits

- Sheet names: max 31 characters
- Rows per sheet: max 1,048,576
- File size: consider streaming for > 10MB
- Unicode in sheet names: avoid characters / \ ? * [ ]

## AI/Vision API Standards

- MUST specify provider and fallback strategy
- MUST specify rate limits and how to handle throttling
- MUST specify cost estimation or budget caps
- MUST specify token/context limits for input images
- MUST specify confidence threshold for acceptable extraction
- SHOULD specify retry strategy for transient API failures

## PDF Processing

- MUST specify image conversion DPI (minimum 150 for technical drawings)
- MUST specify memory management strategy for large files
- MUST specify native dependencies required (poppler, ghostscript, etc.)
- MUST handle corrupted/encrypted PDFs gracefully

## Frontend Standards

- MUST specify accessibility requirements (WCAG 2.1 level)
- MUST specify responsive breakpoints or mobile support
- MUST specify all component states (loading, empty, error, success)
- MUST specify file upload UX states (selecting, uploading, complete, failed)
- SHOULD specify bundle size budget or performance targets
- SHOULD specify browser compatibility targets
