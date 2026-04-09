import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Download, Loader2, Trash2 } from 'lucide-react';
import { useJobs, useDeleteJob } from '@/api/jobs';
import { useCreateExport } from '@/api/exports';
import {
  StateBadge,
  ProgressBar,
  PrimaryButton,
  ErrorBanner,
} from '@/components/kronos';
import type { Job } from '@/types/api';
import { otDisplayName, mapStatus, isValidDownloadUrl } from '@/lib/ot-helpers';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
            if (exportData.download_url && isValidDownloadUrl(exportData.download_url)) {
              window.open(exportData.download_url, '_blank', 'noopener,noreferrer');
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
      aria-label="Descargar Excel"
      className="flex items-center gap-1.5 font-heading text-[11px] font-semibold uppercase text-accent hover:underline transition-colors duration-150 disabled:opacity-50"
    >
      {createExport.isPending ? (
        <Loader2 size={14} strokeWidth={2} className="animate-spin" />
      ) : (
        <Download size={14} strokeWidth={2} />
      )}
      {createExport.isPending ? 'GENERANDO...' : 'DESCARGAR'}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Delete confirmation dialog
// ---------------------------------------------------------------------------

function DeleteConfirmDialog({
  otName,
  fileCount,
  onConfirm,
  onCancel,
  isDeleting,
}: {
  otName: string;
  fileCount: number;
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#0e1721] border border-white/[0.12] p-8 max-w-sm w-full mx-4">
        <h2 className="font-heading text-[13px] font-semibold uppercase tracking-[0.15em] text-white/80">
          Eliminar OT
        </h2>
        <p className="mt-4 font-sans text-sm text-white/60 leading-relaxed">
          ¿Eliminar <span className="text-white font-semibold">{otName}</span>?
          {fileCount > 0 && (
            <> Se eliminarán {fileCount} plano{fileCount !== 1 ? 's' : ''} y todos los datos extraídos.</>
          )}
          <br />
          <span className="text-state-error/80">Esta acción no se puede deshacer.</span>
        </p>
        <div className="mt-6 flex gap-3 justify-end">
          <button
            onClick={onCancel}
            disabled={isDeleting}
            className="font-heading text-[11px] font-semibold uppercase tracking-[0.15em] text-white/40 hover:text-white/60 transition-colors duration-150 px-4 py-2 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="font-heading text-[11px] font-semibold uppercase tracking-[0.15em] text-state-error bg-state-error/10 hover:bg-state-error/20 border border-state-error/30 px-4 py-2 transition-colors duration-150 disabled:opacity-50 flex items-center gap-2"
          >
            {isDeleting ? (
              <Loader2 size={14} strokeWidth={2} className="animate-spin" />
            ) : (
              <Trash2 size={14} strokeWidth={2} />
            )}
            {isDeleting ? 'Eliminando...' : 'Eliminar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// OTsPage
// ---------------------------------------------------------------------------

export default function OTsPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, error } = useJobs(page);
  const deleteJob = useDeleteJob();
  const [deleteTarget, setDeleteTarget] = useState<Job | null>(null);

  const jobs = data?.jobs ?? [];
  const pagination = data?.pagination;
  const isEmpty = !isLoading && jobs.length === 0;

  const handleDelete = useCallback((job: Job, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteTarget(job);
  }, []);

  const confirmDelete = useCallback(() => {
    if (!deleteTarget) return;
    deleteJob.mutate(deleteTarget.job_id, {
      onSuccess: () => setDeleteTarget(null),
    });
  }, [deleteTarget, deleteJob]);

  // -- Loading state (early return before header) ---------------------------
  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 size={20} strokeWidth={2} className="animate-spin text-white/40" />
      </div>
    );
  }

  // -- Shared header + conditional content ---------------------------------
  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="font-sans text-[clamp(1.75rem,3vw,2.5rem)] font-extrabold uppercase tracking-[-0.02em] text-white">
          OTs
        </h1>
        <PrimaryButton onClick={() => navigate('/ots/nueva')}>
          <Plus size={16} strokeWidth={2} />
          NUEVA OT
        </PrimaryButton>
      </div>

      {isError ? (
        <div className="mt-6 max-w-2xl">
          <ErrorBanner message={`Error al cargar las órdenes de trabajo${error?.message ? `: ${error.message}` : ''}`} />
        </div>
      ) : isEmpty ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <p className="font-sans text-[15px] text-white/40">
            No hay órdenes de trabajo
          </p>
        </div>
      ) : (
        <>
      {/* Table */}
      <div className="mt-6 w-full overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-white/[0.08]">
              <th className="text-left font-heading text-[11px] font-semibold tracking-[0.2em] uppercase text-white/40 pb-3 pr-4">
                OT
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
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/ots/${job.job_id}`); } }}
                  tabIndex={0}
                  role="link"
                  aria-label={otDisplayName(job.name, job.job_id)}
                  className="h-14 border-b border-white/[0.04] hover:bg-white/[0.04] cursor-pointer transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-[-2px]"
                >
                  {/* OT */}
                  <td className="pr-4">
                    <span className="font-sans text-sm font-bold text-white truncate block max-w-[280px]">
                      {otDisplayName(job.name, job.job_id)}
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
                    <div className="flex items-center justify-end gap-3">
                      {isDownloadable(job) && (
                        <DownloadButton jobId={job.job_id} />
                      )}
                      {!isProcessing && (
                        <button
                          onClick={(e) => handleDelete(job, e)}
                          aria-label="Eliminar OT"
                          className="text-white/20 hover:text-state-error transition-colors duration-150"
                        >
                          <Trash2 size={14} strokeWidth={2} />
                        </button>
                      )}
                    </div>
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
          <span className="font-heading text-[11px] font-normal text-white/30" aria-live="polite">
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
        </>
      )}

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <DeleteConfirmDialog
          otName={otDisplayName(deleteTarget.name, deleteTarget.job_id)}
          fileCount={deleteTarget.file_count}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
          isDeleting={deleteJob.isPending}
        />
      )}
    </>
  );
}
