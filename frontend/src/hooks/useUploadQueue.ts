import { useCallback, useEffect, useRef, useState } from 'react';
import { xhrUpload } from '@/api/client';
import { API_URL, AUTH_STORAGE_KEY, UPLOAD } from '@/constants';
import type { UploadFile } from '@/types/upload';

let fileCounter = 0;

export function useUploadQueue(jobId: string | null) {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const abortControllers = useRef<Map<string, AbortController>>(new Map());
  const activeCount = useRef(0);

  const uploadingCount = files.filter(f => f.status === 'uploading').length;
  const completedCount = files.filter(f => f.status === 'completed').length;
  const failedCount = files.filter(f => f.status === 'failed').length;
  const isUploading = files.some(f => f.status === 'uploading' || f.status === 'pending');

  // beforeunload warning
  useEffect(() => {
    if (!isUploading) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isUploading]);

  // Ref for cleanup on unmount (assigned after cancelAll is defined)
  const cancelAllRef = useRef<(() => void) | null>(null);

  const updateFile = useCallback((id: string, patch: Partial<UploadFile>) => {
    setFiles(prev => prev.map(f => (f.id === id ? { ...f, ...patch } : f)));
  }, []);

  const processNext = useCallback(async () => {
    if (!jobId) return;
    if (activeCount.current >= UPLOAD.MAX_PARALLEL) return;

    setFiles(prev => {
      const next = prev.find(f => f.status === 'pending');
      if (!next) return prev;

      activeCount.current++;
      const ac = new AbortController();
      abortControllers.current.set(next.id, ac);

      const upload = async () => {
        const apiKey = sessionStorage.getItem(AUTH_STORAGE_KEY) ?? '';
        const formData = new FormData();
        formData.append('files', next.file);

        try {
          const result = await xhrUpload(
            `${API_URL}/api/v1/jobs/${jobId}/upload`,
            formData,
            apiKey,
            (percent) => updateFile(next.id, { progress: percent }),
            ac.signal,
          );

          if (result.status === 401) {
            // 401 → abort all, redirect
            abortControllers.current.forEach(c => c.abort());
            sessionStorage.removeItem(AUTH_STORAGE_KEY);
            window.location.href = '/login';
            return;
          }

          if (result.status >= 200 && result.status < 300) {
            updateFile(next.id, { status: 'completed', progress: 100 });
          } else {
            throw new Error(`HTTP ${result.status}`);
          }
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') {
            updateFile(next.id, { status: 'failed', error: 'Cancelado' });
          } else {
            const retries = next.retries + 1;
            if (retries < UPLOAD.MAX_RETRIES) {
              // Retry with backoff
              const delay = Math.pow(2, retries) * 1000;
              updateFile(next.id, { retries, status: 'pending', progress: 0 });
              setTimeout(() => processNext(), delay);
            } else {
              updateFile(next.id, {
                status: 'failed',
                error: err instanceof Error ? err.message : 'Error de subida',
                retries,
              });
            }
          }
        } finally {
          activeCount.current--;
          abortControllers.current.delete(next.id);
          processNext();
        }
      };

      void upload();
      return prev.map(f => (f.id === next.id ? { ...f, status: 'uploading' as const } : f));
    });
  }, [jobId, updateFile]);

  // Trigger processing when files change
  useEffect(() => {
    processNext();
  }, [files.length, processNext]);

  const addFiles = useCallback((newFiles: File[]) => {
    const uploadFiles: UploadFile[] = newFiles.map(file => ({
      id: `upload-${fileCounter++}`,
      file,
      status: 'pending',
      progress: 0,
      retries: 0,
    }));
    setFiles(prev => [...prev, ...uploadFiles]);
  }, []);

  const retryFile = useCallback((fileId: string) => {
    updateFile(fileId, { status: 'pending', progress: 0, error: undefined, retries: 0 });
  }, [updateFile]);

  const removeFile = useCallback((fileId: string) => {
    const ac = abortControllers.current.get(fileId);
    if (ac) ac.abort();
    setFiles(prev => prev.filter(f => f.id !== fileId));
  }, []);

  const cancelAll = useCallback(() => {
    abortControllers.current.forEach(c => c.abort());
    setFiles(prev => prev.map(f =>
      f.status === 'uploading' || f.status === 'pending'
        ? { ...f, status: 'failed' as const, error: 'Cancelado' }
        : f
    ));
  }, []);

  // Keep ref in sync and cancel uploads on unmount
  cancelAllRef.current = cancelAll;
  useEffect(() => {
    return () => {
      cancelAllRef.current?.();
    };
  }, []);

  const reset = useCallback(() => {
    abortControllers.current.forEach(c => c.abort());
    setFiles([]);
    activeCount.current = 0;
  }, []);

  return {
    files,
    addFiles,
    retryFile,
    removeFile,
    cancelAll,
    reset,
    isUploading,
    completedCount,
    failedCount,
    totalCount: files.length,
    uploadingCount,
  };
}
