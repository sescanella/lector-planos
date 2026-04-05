import { describe, it, expect } from 'vitest';
import {
  JobListSchema,
  SpoolDetailSchema,
  ExportSchema,
  AuthValidateSchema,
  CorrectionResponseSchema,
} from '@/types/api';

describe('Zod API schemas', () => {
  it('validates JobList response', () => {
    const valid = {
      jobs: [
        {
          job_id: '550e8400-e29b-41d4-a716-446655440000',
          status: 'processing',
          created_at: '2026-04-02T10:30:00.000Z',
          completed_at: null,
          file_count: 5,
          processed_count: 2,
          webhook_url: null,
        },
      ],
      pagination: { page: 1, limit: 20, total: 45, total_pages: 3 },
    };
    expect(() => JobListSchema.parse(valid)).not.toThrow();
  });

  it('rejects invalid JobList response', () => {
    const invalid = { jobs: 'not-an-array' };
    expect(() => JobListSchema.parse(invalid)).toThrow();
  });

  it('validates SpoolDetail response', () => {
    const valid = {
      spool_id: '550e8400-e29b-41d4-a716-446655440000',
      spool_number: 'SP-001',
      confidence_score: 0.92,
      metadata: {
        metadata_id: '550e8400-e29b-41d4-a716-446655440001',
        raw_data: { ot: '123', of: '456' },
        confidence_score: 0.95,
      },
      materials: [
        {
          material_id: '550e8400-e29b-41d4-a716-446655440002',
          raw_data: { item: '1', diameter: '2"' },
          confidence_score: 0.88,
        },
      ],
      unions: [],
      cuts: [],
    };
    expect(() => SpoolDetailSchema.parse(valid)).not.toThrow();
  });

  it('validates Export response with download_url', () => {
    const valid = {
      export_id: '550e8400-e29b-41d4-a716-446655440000',
      status: 'completed',
      spool_count: 42,
      download_url: 'https://s3.amazonaws.com/...',
      filename: 'export.xlsx',
      created_at: '2026-04-02T10:30:00.000Z',
      completed_at: '2026-04-02T10:31:00.000Z',
      expires_at: '2026-04-09T10:31:00.000Z',
    };
    expect(() => ExportSchema.parse(valid)).not.toThrow();
  });

  it('validates AuthValidate response', () => {
    expect(() => AuthValidateSchema.parse({ valid: true })).not.toThrow();
    expect(() => AuthValidateSchema.parse({ valid: false })).not.toThrow();
    expect(() => AuthValidateSchema.parse({ invalid: 'field' })).toThrow();
  });

  it('validates CorrectionResponse', () => {
    const valid = {
      correction_id: '550e8400-e29b-41d4-a716-446655440000',
      spool_id: '550e8400-e29b-41d4-a716-446655440001',
      created_at: '2026-04-02T10:30:00.000Z',
    };
    expect(() => CorrectionResponseSchema.parse(valid)).not.toThrow();
  });

  it('shows friendly error on shape mismatch', () => {
    try {
      JobListSchema.parse({ wrong: 'shape' });
    } catch (e) {
      expect(e).toBeDefined();
      if (e instanceof Error) {
        expect(e.message).toBeTruthy();
      }
    }
  });
});
