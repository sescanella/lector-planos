import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Download, Loader2, ChevronRight, FileText, AlertCircle } from 'lucide-react';
import { useJob } from '@/api/jobs';
import { useCreateExport, useExportStatus } from '@/api/exports';
import {
  Breadcrumbs,
  StateBadge,
  ProgressBar,
  AnimatedCounter,
  PrimaryButton,
  ErrorBanner,
} from '@/components/kronos';
import type { BadgeStatus } from '@/components/kronos';
import type { JobDetail, JobFile } from '@/types/api';
import { otDisplayName, mapStatus, isValidDownloadUrl } from '@/lib/ot-helpers';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Estimate remaining time: 69 seconds per remaining file */
function calcETA(processedCount: number, fileCount: number): string {
  const remaining = fileCount - processedCount;
  if (remaining <= 0) return '~1 MIN';

  const totalSec = remaining * 69;
  const min = Math.ceil(totalSec / 60);

  if (min < 60) return `~${min} MIN`;

  const hours = Math.floor(min / 60);
  const mins = min % 60;
  return mins > 0 ? `~${hours} H ${mins} MIN` : `~${hours} H`;
}

/** Calculate processing duration from created_at to completed_at */
function calcDuration(createdAt: string, completedAt: string | null | undefined): string | null {
  if (!completedAt) return null;
  const ms = new Date(completedAt).getTime() - new Date(createdAt).getTime();
  const totalSec = Math.round(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min === 0) return `${sec} seg`;
  return `${min} min ${sec} seg`;
}

// ---------------------------------------------------------------------------
// Download state machine
// ---------------------------------------------------------------------------

type DownloadState = 'idle' | 'creating' | 'polling' | 'downloading';

function downloadButtonLabel(state: DownloadState, isPartial: boolean, processedCount: number, fileCount: number): string {
  switch (state) {
    case 'creating':
    case 'polling':
      return 'GENERANDO...';
    case 'downloading':
      return 'DESCARGANDO...';
    case 'idle':
    default:
      if (isPartial) return `DESCARGAR EXCEL (${processedCount} DE ${fileCount} PLANOS)`;
      return 'DESCARGAR EXCEL';
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Collapsible file list for result mode */
function FileList({ files }: { files: JobFile[] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mt-8">
      <button
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        aria-controls="file-list-content"
        className="flex items-center gap-2 cursor-pointer group"
      >
        <ChevronRight
          size={16}
          strokeWidth={2}
          className={`text-white/40 transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}
        />
        <span className="font-sans text-sm text-white/40 group-hover:text-white/60 transition-colors duration-150">
          Ver planos individuales ({files.length})
        </span>
      </button>

      {expanded && (
        <div id="file-list-content" className="mt-3 flex flex-col gap-1">
          {files.map((file) => {
            const failed = file.status === 'failed';
            return (
              <div key={file.file_id} className="flex items-center gap-3 py-1">
                <FileText size={16} strokeWidth={2} className="text-white/30 shrink-0" />
                <span className="font-sans text-sm text-white/60 truncate max-w-[300px]">
                  {file.filename}
                </span>
                <StateBadge
                  status={
                    file.status === 'completed'
                      ? 'ready'
                      : file.status === 'failed'
                        ? 'error'
                        : file.status === 'processing'
                          ? 'processing'
                          : 'processing'
                  }
                  animated={false}
                />
                {failed && (
                  <>
                    <AlertCircle size={14} strokeWidth={2} className="text-state-error shrink-0" />
                    <span className="font-heading text-[11px] text-state-error/80">
                      Error en procesamiento
                    </span>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Error list for files that failed during processing */
function ProcessingErrors({ files, maxVisible = 5 }: { files: JobFile[]; maxVisible?: number }) {
  const [showAll, setShowAll] = useState(false);
  const failedFiles = files.filter((f) => f.status === 'failed');

  if (failedFiles.length === 0) return null;

  const visible = showAll ? failedFiles : failedFiles.slice(0, maxVisible);
  const hiddenCount = failedFiles.length - maxVisible;

  return (
    <div className="mt-6 flex flex-col gap-1">
      {visible.map((file) => (
        <div key={file.file_id} className="flex items-center gap-2 py-1">
          <span className="font-sans text-sm text-white/60 truncate max-w-[260px]">
            {file.filename}
          </span>
          <span className="font-heading text-[11px] text-state-error/80">
            Error en procesamiento
          </span>
        </div>
      ))}
      {!showAll && hiddenCount > 0 && (
        <button
          onClick={() => setShowAll(true)}
          className="font-heading text-[11px] text-white/40 hover:text-white/60 transition-colors duration-150 mt-1 text-left"
        >
          {hiddenCount} errores más...
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Download handler hook
// ---------------------------------------------------------------------------

function useDownload(jobId: string) {
  const createExport = useCreateExport(jobId);
  const [exportId, setExportId] = useState<string | null>(null);
  const [downloadState, setDownloadState] = useState<DownloadState>('idle');
  const hasDownloaded = useRef(false);

  const { data: exportStatus } = useExportStatus(jobId, exportId);

  // When export status becomes completed, open the download URL
  useEffect(() => {
    if (
      exportStatus?.status === 'completed' &&
      exportStatus.download_url &&
      !hasDownloaded.current
    ) {
      hasDownloaded.current = true;
      setDownloadState('downloading');
      if (isValidDownloadUrl(exportStatus.download_url)) {
        window.open(exportStatus.download_url, '_blank', 'noopener,noreferrer');
      }
      // Reset after a short delay
      setTimeout(() => {
        setDownloadState('idle');
        setExportId(null);
        hasDownloaded.current = false;
      }, 2000);
    }
  }, [exportStatus]);

  const startDownload = useCallback(() => {
    if (downloadState !== 'idle') return;
    setDownloadState('creating');
    hasDownloaded.current = false;

    createExport.mutate(
      { include_confidence: false },
      {
        onSuccess: (data) => {
          if (data.status === 'completed' && data.download_url) {
            // Export already ready (cached)
            hasDownloaded.current = true;
            setDownloadState('downloading');
            if (isValidDownloadUrl(data.download_url)) {
              window.open(data.download_url, '_blank', 'noopener,noreferrer');
            }
            setTimeout(() => {
              setDownloadState('idle');
              hasDownloaded.current = false;
            }, 2000);
          } else {
            // Need to poll
            setExportId(data.export_id);
            setDownloadState('polling');
          }
        },
        onError: () => {
          setDownloadState('idle');
        },
      },
    );
  }, [createExport, downloadState]);

  return { downloadState, startDownload };
}

// ---------------------------------------------------------------------------
// OTDetailPage
// ---------------------------------------------------------------------------

export default function OTDetailPage() {
  const { otId } = useParams<{ otId: string }>();
  const { data: job, isLoading, isError, error } = useJob(otId ?? '');

  // Track transition from processing to result
  const [hasTransitioned, setHasTransitioned] = useState(false);
  const prevStatusRef = useRef<BadgeStatus | null>(null);

  const uiStatus = useMemo(() => {
    if (!job) return null;
    return mapStatus(job);
  }, [job]);

  // Detect transition from processing to result
  useEffect(() => {
    if (!uiStatus) return;
    const prev = prevStatusRef.current;
    if (prev === 'processing' && uiStatus !== 'processing') {
      setHasTransitioned(true);
    }
    prevStatusRef.current = uiStatus;
  }, [uiStatus]);

  const displayName = job ? otDisplayName(job.name, job.job_id) : '';
  const processing = uiStatus === 'processing';

  // -- Loading state --------------------------------------------------------
  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 size={20} strokeWidth={2} className="animate-spin text-white/40" />
      </div>
    );
  }

  // -- Not found state ------------------------------------------------------
  if (isError || !job) {
    const is404 =
      error?.message?.includes('404') ||
      error?.message?.includes('not found') ||
      error?.message?.toLowerCase().includes('not found');

    return (
      <div className="max-w-6xl mx-auto px-6 lg:px-12 py-8 lg:py-12">
        <div className="flex flex-1 flex-col items-center justify-center py-32 gap-6">
          <p className="font-sans text-[15px] text-white/40">
            {is404
              ? 'Esta OT no existe o fue eliminada'
              : 'Error al cargar la OT'}
          </p>
          <Link
            to="/ots"
            className="font-heading text-[11px] font-semibold uppercase tracking-[0.15em] text-accent hover:underline transition-colors duration-150"
          >
            Volver a OTs
          </Link>
        </div>
      </div>
    );
  }

  // -- Render ---------------------------------------------------------------
  return (
    <div className="max-w-6xl mx-auto px-6 lg:px-12 py-8 lg:py-12">
      {/* Breadcrumbs */}
      <Breadcrumbs
        items={[
          { label: 'OTs', href: '/ots' },
          { label: displayName },
        ]}
      />

      {/* Header row */}
      <div className="mt-4 flex items-center justify-between">
        <h1 className="font-sans text-[clamp(1.25rem,2vw,1.75rem)] font-bold text-white">
          {job.name || displayName}
        </h1>
        <StateBadge status={uiStatus!} animated={processing} />
      </div>

      {/* Inline keyframe for fade-in transition */}
      {hasTransitioned && (
        <style>{`@keyframes otFadeIn { from { opacity: 0; } to { opacity: 1; } }`}</style>
      )}

      {/* Content area with transition */}
      <div
        style={
          hasTransitioned
            ? { animation: 'otFadeIn 600ms ease-in-out' }
            : undefined
        }
      >
        {processing ? (
          <ProcessingMode job={job} />
        ) : (
          <ResultMode job={job} uiStatus={uiStatus!} />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Processing Mode
// ---------------------------------------------------------------------------

function ProcessingMode({ job }: { job: JobDetail }) {
  const progressPct =
    job.file_count > 0
      ? Math.round((job.processed_count / job.file_count) * 100)
      : 0;

  const eta = calcETA(job.processed_count, job.file_count);
  const files = job.files ?? [];

  return (
    <div aria-live="polite" aria-atomic="true" className="mt-12 flex flex-col items-center">
      {/* Pulse animation */}
      <style>{`
        @keyframes processingPulse {
          0%, 100% { opacity: 0.15; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(1.05); }
        }
        @keyframes processingRing {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>

      {/* Animated loader */}
      <div className="relative w-32 h-32 flex items-center justify-center">
        {/* Outer pulse */}
        <div
          className="absolute inset-0 rounded-full border border-accent/20"
          style={{ animation: 'processingPulse 3s ease-in-out infinite' }}
        />
        {/* Spinning ring */}
        <div
          className="absolute inset-2 rounded-full border-2 border-transparent border-t-accent/60"
          style={{ animation: 'processingRing 2s linear infinite' }}
        />
        {/* Center counter */}
        <div className="flex flex-col items-center">
          <span className="font-heading text-2xl font-semibold text-white">
            <AnimatedCounter value={job.processed_count} format={(n) => String(Math.round(n))} />
            <span className="text-white/30">/{job.file_count}</span>
          </span>
        </div>
      </div>

      {/* Label */}
      <p className="mt-6 font-heading text-[11px] font-semibold tracking-[0.25em] uppercase text-white/40">
        Procesando planos
      </p>

      {/* Progress bar */}
      <div className="mt-6 w-full max-w-sm">
        <ProgressBar value={progressPct} />
      </div>

      {/* ETA */}
      <p className="mt-4 font-heading text-[11px] tracking-[0.08em] text-white/40">
        Tiempo estimado: <span className="text-white/60">{eta}</span>
      </p>

      {/* Individual errors during processing */}
      <div className="mt-4 w-full max-w-2xl">
        <ProcessingErrors files={files} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Result Mode
// ---------------------------------------------------------------------------

function ResultMode({ job, uiStatus }: { job: JobDetail; uiStatus: BadgeStatus }) {
  const { downloadState, startDownload } = useDownload(job.job_id);
  const isPartial = uiStatus === 'partial';
  const isError = uiStatus === 'error';
  const files = job.files ?? [];
  const failedCount = files.filter((f) => f.status === 'failed').length;

  const duration = calcDuration(job.created_at, job.completed_at);

  return (
    <>
      {/* Summary */}
      <div className="mt-8 text-center">
        {/* TODO: Reemplazar con datos de GET /api/v1/jobs/:jobId/progress
            cuando el endpoint exista. Ver .planning/ux/flow-v1.md seccion 13.
            Cuando exista, mostrar: "{N} planos · {M} materiales · {K} soldaduras · {J} cortes" */}
        <p className="font-heading text-[13px] text-white/60">
          {job.processed_count} planos procesados
          {isPartial && (
            <span className="text-state-error/80">
              {' '}&middot; {failedCount} con errores
            </span>
          )}
        </p>
        {duration && (
          <p className="font-heading text-[11px] text-white/40 mt-1">
            Procesado en {duration}
          </p>
        )}
      </div>

      {/* Download button or error banner */}
      {isError ? (
        <div className="mt-8 max-w-md mx-auto">
          <ErrorBanner message="Error catastrófico en el procesamiento" />
        </div>
      ) : (
        <div className="mt-8 max-w-md mx-auto">
          <PrimaryButton
            onClick={startDownload}
            disabled={downloadState !== 'idle'}
            fullWidth
          >
            {downloadState === 'idle' ? (
              <Download size={16} strokeWidth={2} />
            ) : (
              <Loader2 size={16} strokeWidth={2} className="animate-spin" />
            )}
            {downloadButtonLabel(
              downloadState,
              isPartial,
              job.processed_count,
              job.file_count,
            )}
          </PrimaryButton>
        </div>
      )}

      {/* Collapsible file list */}
      {files.length > 0 && (
        <div className="max-w-2xl mx-auto">
          <FileList files={files} />
        </div>
      )}
    </>
  );
}
