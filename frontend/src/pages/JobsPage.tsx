import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Loader2, FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { JobTable } from '@/components/jobs/JobTable';
import { DropZone } from '@/components/upload/DropZone';
import { FileList } from '@/components/upload/FileList';
import { UploadProgress } from '@/components/upload/UploadProgress';
import { useJobs, useCreateJob } from '@/api/jobs';
import { useUploadQueue } from '@/hooks/useUploadQueue';
import { toast } from '@/hooks/useToast';
import { parseApiError } from '@/api/client';

export function JobsPage() {
  const [page, setPage] = useState(1);
  const [showUpload, setShowUpload] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const navigate = useNavigate();

  const { data, isLoading } = useJobs(page);
  const createJob = useCreateJob();
  const upload = useUploadQueue(jobId);

  const handleFiles = async (files: File[]) => {
    try {
      if (!jobId) {
        const job = await createJob.mutateAsync();
        setJobId(job.job_id);
        upload.addFiles(files);
      } else {
        upload.addFiles(files);
      }
    } catch (err) {
      toast({ title: 'Error', description: parseApiError(err), variant: 'destructive' });
    }
  };

  const handleCancel = () => {
    if (upload.isUploading) {
      if (window.confirm('¿Cancelar las subidas en curso?')) {
        upload.cancelAll();
      }
    } else {
      setShowUpload(false);
      setJobId(null);
      upload.reset();
    }
  };

  // Redirect to job detail when all uploads complete
  const allDone = upload.totalCount > 0 && !upload.isUploading && upload.failedCount === 0;
  if (allDone && jobId) {
    setTimeout(() => navigate(`/jobs/${jobId}`), 500);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20" aria-busy="true">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold">Jobs de Extracción</h1>
        <Button onClick={() => setShowUpload(true)} disabled={showUpload}>
          <Plus className="h-4 w-4 mr-1" />
          Nuevo Job
        </Button>
      </div>

      {showUpload && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Subir archivos PDF</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <DropZone onFiles={handleFiles} disabled={upload.isUploading && upload.uploadingCount >= 5} />
            {upload.totalCount > 0 && (
              <>
                <UploadProgress
                  completed={upload.completedCount}
                  total={upload.totalCount}
                  failed={upload.failedCount}
                />
                <FileList
                  files={upload.files}
                  onRetry={upload.retryFile}
                  onRemove={upload.removeFile}
                />
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleCancel}>
                    Cancelar
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {data && data.jobs.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <JobTable jobs={data.jobs} pagination={data.pagination} onPageChange={setPage} />
          </CardContent>
        </Card>
      ) : !showUpload ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 space-y-4">
            <FolderOpen className="h-12 w-12 text-muted-foreground" />
            <p className="text-muted-foreground">No hay jobs de extracción aún</p>
            <Button onClick={() => setShowUpload(true)}>
              Crear primer job
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
