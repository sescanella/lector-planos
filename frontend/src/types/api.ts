import { z } from 'zod';

// --- Auth ---
export const AuthValidateSchema = z.object({
  valid: z.boolean(),
});

// --- Pagination ---
export const PaginationSchema = z.object({
  page: z.number(),
  limit: z.number(),
  total: z.number(),
  total_pages: z.number(),
});

// --- Jobs ---
export const JobStatusSchema = z.enum(['pending', 'processing', 'completed', 'failed']);

export const JobFileSchema = z.object({
  file_id: z.string().uuid(),
  filename: z.string(),
  status: z.string(),
  page_count: z.number().nullable().optional(),
  failed_pages: z.number().nullable().optional(),
  // Backend serializes BIGINT as string; accept both.
  file_size_bytes: z.union([z.number(), z.string()]).nullable().optional(),
});

export const JobSchema = z.object({
  job_id: z.string().uuid(),
  name: z.string().nullable().optional(),
  status: JobStatusSchema,
  created_at: z.string(),
  completed_at: z.string().nullable().optional(),
  file_count: z.number(),
  processed_count: z.number(),
  webhook_url: z.string().nullable().optional(),
});

export const JobDetailSchema = JobSchema.extend({
  files: z.array(JobFileSchema).optional(),
});

export const JobListSchema = z.object({
  jobs: z.array(JobSchema),
  pagination: PaginationSchema,
});

export const CreateJobSchema = z.object({
  job_id: z.string().uuid(),
  name: z.string().nullable().optional(),
  status: JobStatusSchema,
  created_at: z.string(),
  webhook_url: z.string().nullable().optional(),
});

export const UploadResponseSchema = z.object({
  job_id: z.string().uuid(),
  status: JobStatusSchema,
  file_count: z.number(),
  files: z.array(JobFileSchema),
});

// --- Spools ---
export const SpoolSummarySchema = z.object({
  spool_id: z.string().uuid(),
  spool_number: z.string().nullable(),
  confidence_score: z.number(),
  extraction_status: z.string(),
  file_id: z.string().uuid(),
  created_at: z.string(),
});

export const SpoolListSchema = z.object({
  spools: z.array(SpoolSummarySchema),
  pagination: PaginationSchema,
});

export const SpoolMetadataSchema = z.object({
  metadata_id: z.string().uuid(),
  raw_data: z.record(z.unknown()),
  confidence_score: z.number(),
});

export const SpoolMaterialSchema = z.object({
  material_id: z.string().uuid(),
  raw_data: z.record(z.unknown()),
  confidence_score: z.number(),
});

export const SpoolUnionSchema = z.object({
  union_id: z.string().uuid(),
  raw_data: z.record(z.unknown()),
  confidence_score: z.number(),
});

export const SpoolCutSchema = z.object({
  cut_id: z.string().uuid(),
  raw_data: z.record(z.unknown()),
  confidence_score: z.number(),
});

export const SpoolDetailSchema = z.object({
  spool_id: z.string().uuid(),
  spool_number: z.string().nullable(),
  confidence_score: z.number(),
  metadata: SpoolMetadataSchema.nullable().optional(),
  materials: z.array(SpoolMaterialSchema),
  unions: z.array(SpoolUnionSchema),
  cuts: z.array(SpoolCutSchema),
});

// --- Corrections ---
export const CorrectionFieldTypeSchema = z.enum(['material', 'union', 'cut', 'metadata']);
export const CorrectionTypeSchema = z.enum(['add', 'modify', 'delete']);

export const CorrectionRequestSchema = z.object({
  field_type: CorrectionFieldTypeSchema,
  field_id: z.string().uuid().optional(),
  original_value: z.string(),
  corrected_value: z.string(),
  correction_type: CorrectionTypeSchema,
});

export const CorrectionResponseSchema = z.object({
  correction_id: z.string().uuid(),
  spool_id: z.string().uuid(),
  created_at: z.string(),
});

// --- Exports ---
export const ExportStatusSchema = z.enum(['pending', 'processing', 'completed', 'failed']);

export const ExportSchema = z.object({
  export_id: z.string().uuid(),
  job_id: z.string().uuid().optional(),
  status: ExportStatusSchema,
  spool_count: z.number(),
  include_confidence: z.boolean().optional(),
  file_size_bytes: z.union([z.number(), z.string()]).nullable().optional(),
  download_url: z.string().nullable().optional(),
  filename: z.string().nullable().optional(),
  error_message: z.string().nullable().optional(),
  created_at: z.string(),
  completed_at: z.string().nullable().optional(),
  expires_at: z.string().nullable().optional(),
});

export const ExportListSchema = z.object({
  exports: z.array(ExportSchema),
});

export const CreateExportSchema = ExportSchema;

// --- API Error ---
export const ApiErrorSchema = z.object({
  error: z.string(),
  message: z.string(),
  details: z.array(z.object({
    field: z.string(),
    message: z.string(),
  })).optional(),
});

// --- Inferred types ---
export type AuthValidateResponse = z.infer<typeof AuthValidateSchema>;
export type Pagination = z.infer<typeof PaginationSchema>;
export type JobStatus = z.infer<typeof JobStatusSchema>;
export type JobFile = z.infer<typeof JobFileSchema>;
export type Job = z.infer<typeof JobSchema>;
export type JobDetail = z.infer<typeof JobDetailSchema>;
export type JobListResponse = z.infer<typeof JobListSchema>;
export type CreateJobResponse = z.infer<typeof CreateJobSchema>;
export type UploadResponse = z.infer<typeof UploadResponseSchema>;
export type SpoolSummary = z.infer<typeof SpoolSummarySchema>;
export type SpoolListResponse = z.infer<typeof SpoolListSchema>;
export type SpoolDetail = z.infer<typeof SpoolDetailSchema>;
export type SpoolMaterial = z.infer<typeof SpoolMaterialSchema>;
export type SpoolUnion = z.infer<typeof SpoolUnionSchema>;
export type SpoolCut = z.infer<typeof SpoolCutSchema>;
export type CorrectionRequest = z.infer<typeof CorrectionRequestSchema>;
export type CorrectionResponse = z.infer<typeof CorrectionResponseSchema>;
export type ExportStatus = z.infer<typeof ExportStatusSchema>;
export type Export = z.infer<typeof ExportSchema>;
export type ExportListResponse = z.infer<typeof ExportListSchema>;
export type ApiError = z.infer<typeof ApiErrorSchema>;
