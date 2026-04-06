import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, FileText, Play, Loader2, X } from 'lucide-react';
import {
  Breadcrumbs,
  TechnicalLabel,
  PrimaryButton,
  OutlineButton,
  ErrorBanner,
} from '@/components/kronos';
import { useCreateJob } from '@/api/jobs';
import { useUploadQueue } from '@/hooks/useUploadQueue';
import { UPLOAD } from '@/constants';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LocalFile {
  id: string;
  file: File;
  rejected: boolean;
  rejectReason?: string;
}

type Phase = 'idle' | 'creating' | 'uploading';

let localFileCounter = 0;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function validateFile(
  file: File,
  currentValidCount: number,
): { rejected: boolean; reason?: string } {
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    return { rejected: true, reason: 'Solo se aceptan archivos PDF' };
  }
  if (file.size > UPLOAD.MAX_FILE_SIZE_BYTES) {
    return { rejected: true, reason: 'Excede 50 MB' };
  }
  if (currentValidCount >= UPLOAD.MAX_FILES) {
    return { rejected: true, reason: 'Límite de 200 archivos alcanzado' };
  }
  return { rejected: false };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NuevaOTPage() {
  const navigate = useNavigate();
  const createJob = useCreateJob();

  // Phase management
  const [phase, setPhase] = useState<Phase>('idle');
  const [jobId, setJobId] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  // Form state (phase: idle)
  const [nombre, setNombre] = useState('');
  const [localFiles, setLocalFiles] = useState<LocalFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Upload queue (phase: uploading)
  const upload = useUploadQueue(jobId);

  // Derived
  const validFiles = localFiles.filter(f => !f.rejected);
  const canSubmit =
    nombre.trim().length > 0 && validFiles.length > 0 && phase === 'idle';

  // ------------------------------------------------------------------
  // File selection
  // ------------------------------------------------------------------

  const addFilesFromInput = useCallback((fileList: FileList | File[]) => {
    const incoming = Array.from(fileList);
    setLocalFiles(prev => {
      let currentValidCount = prev.filter(f => !f.rejected).length;
      const newFiles: LocalFile[] = incoming.map(file => {
        const validation = validateFile(file, currentValidCount);
        if (!validation.rejected) currentValidCount++;
        return {
          id: `local-${localFileCounter++}`,
          file,
          rejected: validation.rejected,
          rejectReason: validation.reason,
        };
      });
      return [...prev, ...newFiles];
    });
  }, []);

  const removeLocalFile = useCallback((id: string) => {
    setLocalFiles(prev => prev.filter(f => f.id !== id));
  }, []);

  // ------------------------------------------------------------------
  // Drag & drop handlers
  // ------------------------------------------------------------------

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        addFilesFromInput(e.dataTransfer.files);
      }
    },
    [addFilesFromInput],
  );

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        addFilesFromInput(e.target.files);
      }
      // Reset input so the same file can be re-selected
      e.target.value = '';
    },
    [addFilesFromInput],
  );

  // ------------------------------------------------------------------
  // Submit: create job then upload
  // ------------------------------------------------------------------

  const isSubmitting = useRef(false);

  const handleSubmit = async () => {
    if (!canSubmit || isSubmitting.current) return;
    isSubmitting.current = true;
    setCreateError(null);
    setPhase('creating');

    try {
      const result = await createJob.mutateAsync({ name: nombre.trim() });
      setJobId(result.job_id);
      setPhase('uploading');
    } catch {
      setCreateError('Error al crear la OT. Intenta nuevamente.');
      setPhase('idle');
      isSubmitting.current = false;
    }
  };

  // When jobId is set and phase is uploading, push files to the upload queue
  const hasStartedUpload = useRef(false);
  useEffect(() => {
    if (phase === 'uploading' && jobId && !hasStartedUpload.current) {
      hasStartedUpload.current = true;
      const rawFiles = validFiles.map(f => f.file);
      upload.addFiles(rawFiles);
    }
    // Only trigger when phase/jobId change; validFiles is captured at that moment
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, jobId]);

  // When all uploads complete, navigate to the OT detail
  useEffect(() => {
    if (
      phase === 'uploading' &&
      jobId &&
      upload.totalCount > 0 &&
      !upload.isUploading
    ) {
      // All done (completed + failed = total, none pending/uploading)
      navigate(`/ots/${jobId}`, { replace: true });
    }
  }, [phase, jobId, upload.totalCount, upload.isUploading, navigate]);

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  return (
    <div>
      {/* Breadcrumbs */}
      <Breadcrumbs
        items={[{ label: 'OTs', href: '/ots' }, { label: 'Nueva OT' }]}
      />

      {/* Technical label */}
      <div className="mt-4">
        <TechnicalLabel system="SISTEMA 02" name="NUEVA ORDEN DE TRABAJO" />
      </div>

      {/* Page title */}
      <h1
        className="mb-8 mt-4 font-sans font-extrabold uppercase tracking-[-0.02em] text-white"
        style={{ fontSize: 'clamp(1.75rem, 3vw, 2.5rem)' }}
      >
        Nueva OT
      </h1>

      {/* Error banner */}
      {createError && (
        <div className="mb-6 max-w-2xl">
          <ErrorBanner message={createError} />
        </div>
      )}

      {/* ---------- Campo: Nombre ---------- */}
      <div>
        <label className="mb-2 flex items-center gap-2">
          <span className="text-[10px] leading-none text-accent">◆</span>
          <span className="font-heading text-[11px] font-semibold uppercase tracking-[0.25em] text-white/60">
            Nombre
          </span>
        </label>
        <input
          type="text"
          value={nombre}
          onChange={e => setNombre(e.target.value)}
          placeholder="Ej: Cotización Codelco Q2 2026"
          disabled={phase !== 'idle'}
          className="w-full max-w-2xl rounded-none border border-white/[0.12] bg-white/[0.04] px-4 py-3 font-sans text-[15px] text-white outline-none transition-[border-color] duration-150 placeholder:text-white/30 focus:border-white/30 disabled:opacity-50"
        />
      </div>

      {/* ---------- Drop zone ---------- */}
      <div className="mt-8">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[10px] leading-none text-accent">◆</span>
          <span className="font-heading text-[11px] font-semibold uppercase tracking-[0.25em] text-white/60">
            Planos
          </span>
        </div>

        {phase === 'idle' && (
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`flex h-40 w-full max-w-2xl cursor-pointer flex-col items-center justify-center gap-2 border-2 border-dashed transition-colors duration-150 ${
              dragOver
                ? 'border-white/30 bg-white/[0.04]'
                : 'border-white/[0.12] bg-white/[0.02]'
            }`}
          >
            <Upload size={40} strokeWidth={1.5} className="text-white/20 mb-3" />
            <span className="font-sans text-[15px] text-white/60">
              Arrastra PDFs aquí o haz clic para seleccionar
            </span>
            <span className="font-heading text-[11px] text-white/30">
              Hasta 200 archivos · 50 MB máx.
            </span>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          multiple
          className="hidden"
          onChange={handleFileInputChange}
        />
      </div>

      {/* ---------- File list (idle phase) ---------- */}
      {phase === 'idle' && localFiles.length > 0 && (
        <div className="mt-4 max-w-2xl">
          {/* Metrics bar */}
          <div className="flex items-center gap-3 font-heading text-[11px] font-semibold text-white/60">
            <span>
              {validFiles.length} / {UPLOAD.MAX_FILES} archivos
            </span>
            <span className="text-[6px] text-white/20" aria-hidden="true">●</span>
            <span>
              {formatFileSize(validFiles.reduce((sum, f) => sum + f.file.size, 0))} / {formatFileSize(UPLOAD.MAX_FILES * UPLOAD.MAX_FILE_SIZE_BYTES)}
            </span>
            {localFiles.some(f => f.rejected) && (
              <>
                <span className="text-[6px] text-white/20" aria-hidden="true">●</span>
                <span className="text-[#F87171]">
                  {localFiles.filter(f => f.rejected).length} rechazado{localFiles.filter(f => f.rejected).length !== 1 ? 's' : ''}
                </span>
              </>
            )}
          </div>

          <div className="mt-2 max-h-64 overflow-y-auto">
            {localFiles.map(lf => (
              <div
                key={lf.id}
                className="flex items-center justify-between border-b border-white/[0.04] py-2"
              >
                <div className="mr-4 min-w-0 flex-1 flex items-center gap-2">
                  <FileText size={16} strokeWidth={2} className="text-white/30 shrink-0" />
                  <span className="block truncate font-sans text-sm text-white/85">
                    {lf.file.name}
                  </span>
                  {lf.rejected && lf.rejectReason && (
                    <span className="font-heading text-[11px] text-[#F87171]">
                      {lf.rejectReason}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-heading text-[11px] text-white/40">
                    {formatFileSize(lf.file.size)}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeLocalFile(lf.id)}
                    className="text-white/30 transition-colors duration-150 hover:text-white/60"
                    aria-label={`Quitar ${lf.file.name}`}
                  >
                    <X size={14} strokeWidth={2} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---------- Upload progress (uploading phase) ---------- */}
      {phase === 'uploading' && upload.totalCount > 0 && (
        <div className="mt-4 max-w-2xl">
          <span className="font-heading text-[11px] font-semibold text-white/60">
            Subiendo: {upload.completedCount} / {upload.totalCount} archivos
            {upload.failedCount > 0 && (
              <span className="ml-2 text-[#F87171]">
                · {upload.failedCount} con error
              </span>
            )}
          </span>

          {/* Simple progress bar */}
          <div className="mt-2 h-1 w-full overflow-hidden bg-white/[0.08]">
            <div
              className="h-full bg-accent transition-[width] duration-300 ease-out"
              style={{
                width: `${upload.totalCount > 0 ? (upload.completedCount / upload.totalCount) * 100 : 0}%`,
              }}
            />
          </div>

          <div className="mt-2 max-h-64 overflow-y-auto">
            {upload.files.map(uf => (
              <div
                key={uf.id}
                className="flex items-center justify-between border-b border-white/[0.04] py-2"
              >
                <div className="mr-4 min-w-0 flex-1">
                  <span className="block truncate font-sans text-sm text-white/85">
                    {uf.file.name}
                  </span>
                  {uf.status === 'failed' && uf.error && (
                    <span className="font-heading text-[11px] text-[#F87171]">
                      {uf.error}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-heading text-[11px] text-white/40">
                    {uf.status === 'completed' && 'Listo'}
                    {uf.status === 'uploading' && `${uf.progress}%`}
                    {uf.status === 'pending' && 'Pendiente'}
                    {uf.status === 'failed' && 'Error'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---------- Action buttons ---------- */}
      <div className="mt-8 flex max-w-2xl items-center justify-end gap-4">
        <OutlineButton
          onClick={() => navigate('/ots')}
          disabled={phase === 'uploading'}
        >
          Cancelar
        </OutlineButton>
        <PrimaryButton
          onClick={handleSubmit}
          disabled={!canSubmit || phase !== 'idle'}
        >
          {phase === 'idle' ? (
            <Play size={16} strokeWidth={2} />
          ) : (
            <Loader2 size={16} strokeWidth={2} className="animate-spin" />
          )}
          {phase === 'creating'
            ? 'Creando OT...'
            : phase === 'uploading'
              ? 'Subiendo...'
              : 'Iniciar procesamiento'}
        </PrimaryButton>
      </div>
    </div>
  );
}
