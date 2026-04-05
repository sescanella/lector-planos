import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Loader2, ChevronLeft, ChevronRight, FileText, Inbox } from 'lucide-react';
import { ZodError } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/jobs/StatusBadge';
import { ConfidenceBadge } from '@/components/spools/ConfidenceBadge';
import { ExportButton } from '@/components/export/ExportButton';
import { useJob } from '@/api/jobs';
import { useSpools } from '@/api/spools';
import { formatDate, formatFileSize } from '@/lib/utils';

export function JobDetailPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const [spoolPage, setSpoolPage] = useState(1);

  const { data: job, isLoading: jobLoading, error: jobError } = useJob(jobId ?? '');
  const { data: spoolsData, isLoading: spoolsLoading } = useSpools(jobId ?? '', spoolPage);

  if (jobLoading) {
    return (
      <div className="flex items-center justify-center py-20" aria-busy="true">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (jobError || !job) {
    const isZodError = jobError instanceof ZodError;
    return (
      <div className="mx-auto max-w-7xl px-4 py-16 text-center">
        <h2 className="font-heading text-xl font-bold mb-2">
          {isZodError ? 'Error de formato' : 'No encontrado'}
        </h2>
        <p className="text-muted-foreground mb-4">
          {isZodError
            ? 'El servidor devolvió datos con un formato inesperado. Intenta recargar la página.'
            : 'El job no existe o fue eliminado.'}
        </p>
        <Button variant="outline" onClick={() => navigate('/jobs')}>
          Volver al dashboard
        </Button>
      </div>
    );
  }

  const spoolStart = spoolsData ? (spoolsData.pagination.page - 1) * spoolsData.pagination.limit + 1 : 0;
  const spoolEnd = spoolsData ? Math.min(spoolsData.pagination.page * spoolsData.pagination.limit, spoolsData.pagination.total) : 0;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold">Job {job.job_id.slice(0, 8)}...</h1>
          <p className="text-sm text-muted-foreground mt-1">{formatDate(job.created_at)}</p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={job.status} />
          <ExportButton jobId={job.job_id} jobCompleted={job.status === 'completed'} />
        </div>
      </div>

      {/* Files table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Archivos ({job.file_count})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label="Archivos del job">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium">Nombre</th>
                  <th className="px-4 py-3 text-left font-medium">Tamaño</th>
                  <th className="px-4 py-3 text-center font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {job.files?.map(file => (
                  <tr key={file.file_id} className="border-b">
                    <td className="px-4 py-3 flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      {file.filename}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {file.file_size_bytes ? formatFileSize(file.file_size_bytes) : '-'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={file.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Spools table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Spools Extraídos</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {spoolsLoading ? (
            <div className="flex items-center justify-center py-10" aria-busy="true">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : spoolsData && spoolsData.spools.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" aria-label="Spools extraídos del job">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-4 py-3 text-left font-medium">Spool</th>
                      <th className="px-4 py-3 text-center font-medium">Confianza</th>
                      <th className="px-4 py-3 text-center font-medium">Estado</th>
                      <th className="px-4 py-3 text-right font-medium">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {spoolsData.spools.map(spool => (
                      <tr key={spool.spool_id} className="border-b hover:bg-muted/30">
                        <td className="px-4 py-3 font-medium">{spool.spool_number ?? spool.spool_id.slice(0, 8)}</td>
                        <td className="px-4 py-3 text-center">
                          <ConfidenceBadge score={spool.confidence_score} />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <StatusBadge status={spool.extraction_status} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link to={`/jobs/${jobId}/spools/${spool.spool_id}`}>
                            <Button variant="outline" size="sm">Ver detalle</Button>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {spoolsData.pagination.total > spoolsData.pagination.limit && (
                <div className="flex items-center justify-between px-4 py-3 text-sm text-muted-foreground">
                  <span>Mostrando {spoolStart}-{spoolEnd} de {spoolsData.pagination.total}</span>
                  <div className="flex gap-1">
                    <Button variant="outline" size="icon" className="h-8 w-8" disabled={spoolsData.pagination.page <= 1} onClick={() => setSpoolPage(p => p - 1)}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" className="h-8 w-8" disabled={spoolsData.pagination.page >= spoolsData.pagination.total_pages} onClick={() => setSpoolPage(p => p + 1)}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 space-y-2">
              <Inbox className="h-10 w-10 text-muted-foreground" />
              <p className="text-muted-foreground text-sm">No hay spools procesados aún</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
