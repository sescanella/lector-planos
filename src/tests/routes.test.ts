import express from 'express';
import request from 'supertest';

// Mock env before importing modules that use it
jest.mock('../config/env', () => ({
  env: {
    API_KEY: 'test-api-key-12345',
    NODE_ENV: 'test',
    CORS_ORIGIN: '*',
    PORT: 3000,
    S3_BUCKET_NAME: 'test-bucket',
    DATABASE_URL: 'postgres://mock',
    DB_POOL_MAX: 5,
  },
}));

// Shared mock query function — tests can override per-suite
const mockQuery = jest.fn();

jest.mock('../db', () => ({
  getPool: () => ({
    query: mockQuery,
  }),
}));

import { authMiddleware } from '../middleware/auth';

// ─── Auth middleware ────────────────────────────────────────────────

describe('Auth middleware', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/v1', authMiddleware);
    app.get('/api/v1/test', (_req, res) => res.json({ ok: true }));
  });

  it('should reject requests without API key', async () => {
    const res = await request(app).get('/api/v1/test');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('unauthorized');
  });

  it('should reject requests with wrong API key', async () => {
    const res = await request(app)
      .get('/api/v1/test')
      .set('X-API-Key', 'wrong-key');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('unauthorized');
  });

  it('should accept requests with correct API key', async () => {
    const res = await request(app)
      .get('/api/v1/test')
      .set('X-API-Key', 'test-api-key-12345');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

// ─── Spools route — corrections validation ─────────────────────────

describe('Spools route - corrections validation', () => {
  let app: express.Express;
  const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

  beforeAll(async () => {
    // Dynamic import after mocks are set up
    const { default: spoolsRouter } = await import('../routes/spools');
    app = express();
    app.use(express.json());
    app.use('/api/v1/spools', spoolsRouter);
  });

  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('should reject invalid spool ID format', async () => {
    const res = await request(app)
      .post('/api/v1/spools/not-a-uuid/corrections')
      .send({
        field_type: 'material',
        correction_type: 'modify',
        original_value: 'a',
        corrected_value: 'b',
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
    expect(res.body.message).toMatch(/spool ID/i);
  });

  it('should return 404 for non-existent spool', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // spool lookup
    const res = await request(app)
      .post(`/api/v1/spools/${VALID_UUID}/corrections`)
      .send({
        field_type: 'material',
        correction_type: 'modify',
        original_value: 'a',
        corrected_value: 'b',
      });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('not_found');
  });

  it('should reject correction with invalid field_type', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ spool_id: VALID_UUID }] }); // spool exists
    const res = await request(app)
      .post(`/api/v1/spools/${VALID_UUID}/corrections`)
      .send({
        field_type: 'invalid',
        correction_type: 'modify',
        original_value: 'a',
        corrected_value: 'b',
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
    expect(res.body.message).toMatch(/field_type/i);
  });

  it('should reject correction with invalid correction_type', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ spool_id: VALID_UUID }] });
    const res = await request(app)
      .post(`/api/v1/spools/${VALID_UUID}/corrections`)
      .send({
        field_type: 'material',
        correction_type: 'invalid_type',
        original_value: 'a',
        corrected_value: 'b',
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
    expect(res.body.message).toMatch(/correction_type/i);
  });

  it('should reject correction with original_value too long', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ spool_id: VALID_UUID }] });
    const longValue = 'x'.repeat(10001);
    const res = await request(app)
      .post(`/api/v1/spools/${VALID_UUID}/corrections`)
      .send({
        field_type: 'material',
        correction_type: 'modify',
        original_value: longValue,
        corrected_value: 'b',
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
    expect(res.body.message).toMatch(/original_value/i);
  });

  it('should reject correction with corrected_value too long', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ spool_id: VALID_UUID }] });
    const longValue = 'x'.repeat(10001);
    const res = await request(app)
      .post(`/api/v1/spools/${VALID_UUID}/corrections`)
      .send({
        field_type: 'material',
        correction_type: 'modify',
        original_value: 'a',
        corrected_value: longValue,
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
    expect(res.body.message).toMatch(/corrected_value/i);
  });

  it('should reject correction with invalid field_id UUID', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ spool_id: VALID_UUID }] });
    const res = await request(app)
      .post(`/api/v1/spools/${VALID_UUID}/corrections`)
      .send({
        field_type: 'material',
        field_id: 'not-a-uuid',
        correction_type: 'modify',
        original_value: 'a',
        corrected_value: 'b',
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
    expect(res.body.message).toMatch(/field_id/i);
  });

  it('should reject correction with missing original_value and corrected_value', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ spool_id: VALID_UUID }] });
    const res = await request(app)
      .post(`/api/v1/spools/${VALID_UUID}/corrections`)
      .send({
        field_type: 'material',
        correction_type: 'modify',
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
    expect(res.body.message).toMatch(/required/i);
  });

  it('should accept valid correction and return 201', async () => {
    const now = new Date().toISOString();
    mockQuery
      .mockResolvedValueOnce({ rows: [{ spool_id: VALID_UUID }] }) // spool exists
      .mockResolvedValueOnce({
        rows: [{ correction_id: 'c-1', spool_id: VALID_UUID, created_at: now }],
      }); // INSERT
    const res = await request(app)
      .post(`/api/v1/spools/${VALID_UUID}/corrections`)
      .send({
        field_type: 'material',
        correction_type: 'modify',
        original_value: 'old',
        corrected_value: 'new',
      });
    expect(res.status).toBe(201);
    expect(res.body.correction_id).toBe('c-1');
    expect(res.body.spool_id).toBe(VALID_UUID);
  });

  it('should reject GET spool with invalid UUID', async () => {
    const res = await request(app).get('/api/v1/spools/bad-id');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });

  it('should return 404 for GET non-existent spool', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get(`/api/v1/spools/${VALID_UUID}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('not_found');
  });
});

// ─── Jobs route — validation ───────────────────────────────────────

describe('Jobs route - validation', () => {
  let app: express.Express;
  const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

  beforeAll(async () => {
    const { default: jobsRouter } = await import('../routes/jobs');
    app = express();
    app.use(express.json());
    app.use('/api/v1/jobs', jobsRouter);
  });

  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('should reject GET job with invalid UUID', async () => {
    const res = await request(app).get('/api/v1/jobs/not-a-uuid');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
    expect(res.body.message).toMatch(/job ID/i);
  });

  it('should return 404 for non-existent job', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // job lookup
    const res = await request(app).get(`/api/v1/jobs/${VALID_UUID}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('not_found');
  });

  it('should return job with files when found', async () => {
    const jobRow = {
      job_id: VALID_UUID,
      name: null,
      status: 'processing',
      created_at: new Date().toISOString(),
      completed_at: null,
      file_count: 1,
      processed_count: 0,
      webhook_url: null,
    };
    const fileRow = {
      file_id: 'f1',
      filename: 'test.pdf',
      status: 'uploaded',
      page_count: null,
      failed_pages: null,
    };
    mockQuery
      .mockResolvedValueOnce({ rows: [jobRow] }) // job query
      .mockResolvedValueOnce({ rows: [fileRow] }); // files query

    const res = await request(app).get(`/api/v1/jobs/${VALID_UUID}`);
    expect(res.status).toBe(200);
    expect(res.body.job_id).toBe(VALID_UUID);
    expect(res.body.files).toHaveLength(1);
    expect(res.body.files[0].filename).toBe('test.pdf');
  });

  it('should create a job via POST', async () => {
    const now = new Date().toISOString();
    mockQuery.mockResolvedValueOnce({
      rows: [{ job_id: VALID_UUID, status: 'created', created_at: now, webhook_url: null, name: null }],
    });

    const res = await request(app)
      .post('/api/v1/jobs')
      .send({});
    expect(res.status).toBe(201);
    expect(res.body.job_id).toBe(VALID_UUID);
    expect(res.body.status).toBe('created');
    expect(res.body.name).toBeNull();
  });

  it('should create a job with a name via POST', async () => {
    const now = new Date().toISOString();
    mockQuery.mockResolvedValueOnce({
      rows: [{ job_id: VALID_UUID, status: 'created', created_at: now, webhook_url: null, name: 'Cotización Codelco Q2 2026' }],
    });

    const res = await request(app)
      .post('/api/v1/jobs')
      .send({ name: 'Cotización Codelco Q2 2026' });
    expect(res.status).toBe(201);
    expect(res.body.job_id).toBe(VALID_UUID);
    expect(res.body.name).toBe('Cotización Codelco Q2 2026');
  });

  it('should reject job creation with empty name', async () => {
    const res = await request(app)
      .post('/api/v1/jobs')
      .send({ name: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });

  it('should reject job creation with name too long', async () => {
    const res = await request(app)
      .post('/api/v1/jobs')
      .send({ name: 'x'.repeat(256) });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });

  it('should reject upload with invalid job UUID', async () => {
    const res = await request(app)
      .post('/api/v1/jobs/not-a-uuid/upload');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });

  it('should return 400 for upload with no files (validated before job lookup)', async () => {
    // File validation now happens before the transactional job lookup (FOR UPDATE),
    // so a request with no files returns 400 regardless of whether the job exists.
    const res = await request(app)
      .post(`/api/v1/jobs/${VALID_UUID}/upload`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });
});
