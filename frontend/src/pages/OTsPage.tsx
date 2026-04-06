import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useJobs } from '@/api/jobs';
import { useCreateExport } from '@/api/exports';
import {
  TechnicalLabel,
  StateBadge,
  ProgressBar,
  PrimaryButton,
} from '@/components/kronos';
import type { Job } from '@/types/api';
import type { BadgeStatus } from '@/components/kronos';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a short OT identifier from the last 4 chars of a UUID */
function shortOTId(jobId: string): string {
  return `OT-${jobId.slice(-4).toUpperCase()}`;
}

/** Map backend job status to UI badge status */
function mapStatus(job: Job): BadgeStatus {
  switch (job.status) {
    case 'pending':
    case 'processing':
      return 'processing';
    case 'completed':
      return job.processed_count < job.file_count ? 'partial' : 'ready';
    case 'failed':
      return 'error';
    default:
      return 'error';
  }
}

/** Format a date string as "DD MMM" in uppercase Spanish (e.g. "05 ABR") */
function formatDateShort(dateStr: string): string {
  const date = new Date(dateStr);
  const formatted = new Intl.DateTimeFormat('es-CL', {
    day: '2-digit',
    month: 'short',
  }).format(date);
  return formatted.toUpperCase().replace('.', '');
}

/** Check if a job can be downloaded (ready or partial) */
function isDownloadable(job: Job): boolean {
  const status = mapStatus(job);
  return status === 'ready' || status === 'partial';
}

// ---------------------------------------------------------------------------
// Download button (needs its own component for the hook)
// ---------------------------------------------------------------------------

function DownloadButton({ jobId }: { jobId: string }) {
  const createExport = useCreateExport(jobId);

  const handleDownload = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation(); // Don't trigger row navigation
      createExport.mutate(
        { include_confidence: false },
        {
          onSuccess: (exportData) => {
            if (exportData.download_url) {
              window.open(exportData.download_url, '_blank');
            }
          },
        },
      );
    },
    [createExport],
  );

  return (
    <button
      onClick={handleDownload}
      disabled={createExport.isPending}
      className="font-heading text-[11px] font-semibold uppercase text-accent hover:underline transition-colors duration-150 disabled:opacity-50"
    >
      {createExport.isPending ? 'GENERANDO...' : 'DESCARGAR'}
    </button>
  );
}

// ---------------------------------------------------------------------------
// OTsPage
// ---------------------------------------------------------------------------

export default function OTsPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const { data, isLoading } = useJobs(page);

  const jobs = data?.jobs ?? [];
  const pagination = data?.pagination;
  const isEmpty = !isLoading && jobs.length === 0;

  // -- Loading state --------------------------------------------------------
  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="font-sans text-[15px] text-white/40">Cargando...</p>
      </div>
    );
  }

  // -- Empty state ----------------------------------------------------------
  if (isEmpty) {
    return (
      <div className="max-w-6xl mx-auto px-6 lg:px-12 py-8 lg:py-12">
        <TechnicalLabel system="SISTEMA 01" name="ÓRDENES DE TRABAJO" />

        <div className="mt-6 flex items-center justify-between">
          <h1 className="font-sans text-[clamp(1.75rem,3vw,2.5rem)] font-extrabold uppercase tracking-[-0.02em] text-white">
            OTs
          </h1>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center py-32 gap-6">
          <p className="font-sans text-[15px] text-white/40">
            No hay órdenes de trabajo
          </p>
          <PrimaryButton onClick={() => navigate('/ots/nueva')}>
            + NUEVA OT
          </PrimaryButton>
        </div>
      </div>
    );
  }

  // -- Table state ----------------------------------------------------------
  return (
    <div className="max-w-6xl mx-auto px-6 lg:px-12 py-8 lg:py-12">
      <TechnicalLabel system="SISTEMA 01" name="ÓRDENES DE TRABAJO" />

      <div className="mt-6 flex items-center justify-between">
        <h1 className="font-sans text-[clamp(1.75rem,3vw,2.5rem)] font-extrabold uppercase tracking-[-0.02em] text-white">
          OTs
        </h1>
        <PrimaryButton onClick={() => navigate('/ots/nueva')}>
          + NUEVA OT
        </PrimaryButton>
      </div>

      {/* Table */}
      <div className="mt-8 w-full overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-white/[0.08]">
              <th className="text-left font-heading text-[11px] font-semibold tracking-[0.2em] uppercase text-white/40 pb-3 pr-4">
                ID
              </th>
              <th className="text-left font-heading text-[11px] font-semibold tracking-[0.2em] uppercase text-white/40 pb-3 pr-4">
                NOMBRE
              </th>
              <th className="text-left font-heading text-[11px] font-semibold tracking-[0.2em] uppercase text-white/40 pb-3 pr-4">
                ESTADO
              </th>
              <th className="text-left font-heading text-[11px] font-semibold tracking-[0.2em] uppercase text-white/40 pb-3 pr-4">
                PLANOS
              </th>
              <th className="text-left font-heading text-[11px] font-semibold tracking-[0.2em] uppercase text-white/40 pb-3 pr-4">
                FECHA
              </th>
              {/* Action column — no header */}
              <th className="pb-3" />
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => {
              const uiStatus = mapStatus(job);
              const isProcessing = uiStatus === 'processing';

              return (
                <tr
                  key={job.job_id}
                  onClick={() => navigate(`/ots/${job.job_id}`)}
                  className="h-14 border-b border-white/[0.04] hover:bg-white/[0.04] cursor-pointer transition-colors duration-150"
                >
                  {/* ID */}
                  <td className="pr-4">
                    <span className="font-heading text-[13px] font-semibold text-white/40">
                      {shortOTId(job.job_id)}
                    </span>
                  </td>

                  {/* NOMBRE */}
                  <td className="pr-4">
                    {/* TODO: El backend no tiene un campo "nombre" en el JobSchema.
                        Cuando se añada (ej: job.name), reemplazar este placeholder. */}
                    <span className="font-sans text-sm font-bold text-white truncate block max-w-[240px]">
                      OT sin nombre
                    </span>
                  </td>

                  {/* ESTADO */}
                  <td className="pr-4">
                    <StateBadge
                      status={uiStatus}
                      animated={isProcessing}
                    />
                  </td>

                  {/* PLANOS */}
                  <td className="pr-4">
                    <div className="flex flex-col gap-1">
                      <span className="font-heading text-[13px] font-normal text-white/60">
                        {job.processed_count}/{job.file_count}
                      </span>
                      {isProcessing && job.file_count > 0 && (
                        <ProgressBar
                          value={Math.round(
                            (job.processed_count / job.file_count) * 100,
                          )}
                          showPercentage={false}
                        />
                      )}
                    </div>
                  </td>

                  {/* FECHA */}
                  <td className="pr-4">
                    <span className="font-heading text-[11px] font-normal text-white/40">
                      {formatDateShort(job.created_at)}
                    </span>
                  </td>

                  {/* ACCIÓN */}
                  <td className="text-right">
                    {isDownloadable(job) && (
                      <DownloadButton jobId={job.job_id} />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination && pagination.total_pages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="font-heading text-[11px] font-semibold uppercase tracking-[0.15em] text-white/40 hover:text-white/60 transition-colors duration-150 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Anterior
          </button>
          <span className="font-heading text-[11px] font-normal text-white/30">
            {page} / {pagination.total_pages}
          </span>
          <button
            onClick={() =>
              setPage((p) => Math.min(pagination.total_pages, p + 1))
            }
            disabled={page >= pagination.total_pages}
            className="font-heading text-[11px] font-semibold uppercase tracking-[0.15em] text-white/40 hover:text-white/60 transition-colors duration-150 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Siguiente
          </button>
        </div>
      )}
    </div>
  );
}
