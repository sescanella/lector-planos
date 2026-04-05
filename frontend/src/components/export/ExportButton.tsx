import { useState } from 'react';
import { Download, FileSpreadsheet, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/jobs/StatusBadge';
import { useExports, useExportStatus, useCreateExport } from '@/api/exports';
import { toast } from '@/hooks/useToast';
import { parseApiError } from '@/api/client';
import type { HTTPError } from 'ky';

function isHttpStatus(error: unknown, status: number): boolean {
  return (
    error instanceof Error &&
    'response' in error &&
    (error as HTTPError).response.status === status
  );
}

interface ExportButtonProps {
  jobId: string;
  jobCompleted: boolean;
}

export function ExportButton({ jobId, jobCompleted }: ExportButtonProps) {
  const [activeExportId, setActiveExportId] = useState<string | null>(null);
  const { data: exportsData } = useExports(jobId);
  const { data: exportStatus, error: exportError } = useExportStatus(jobId, activeExportId);
  const createExport = useCreateExport(jobId);

  const isExpired = isHttpStatus(exportError, 410);

  const latestExport = exportsData?.exports?.[0];
  const activeExport = exportStatus ?? latestExport;

  const isInFlight = activeExport?.status === 'pending' || activeExport?.status === 'processing';

  const handleGenerate = async () => {
    try {
      const result = await createExport.mutateAsync({ include_confidence: false });
      setActiveExportId(result.export_id);
      toast({ title: 'Generando Excel...' });
    } catch (err) {
      toast({ title: 'Error', description: parseApiError(err), variant: 'destructive' });
    }
  };

  const handleDownload = () => {
    if (exportStatus?.download_url) {
      window.open(exportStatus.download_url, '_blank');
    }
  };

  if (exportStatus?.status === 'completed' && exportStatus.download_url) {
    return (
      <div className="flex items-center gap-3">
        <StatusBadge status="completed" />
        <Button onClick={handleDownload} variant="default" size="sm">
          <Download className="h-4 w-4 mr-1" />
          Descargar Excel
        </Button>
      </div>
    );
  }

  if (isExpired) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm text-error">Export expirado, genera uno nuevo.</span>
        <Button onClick={handleGenerate} variant="outline" size="sm" disabled={!jobCompleted}>
          <FileSpreadsheet className="h-4 w-4 mr-1" />
          Generar nuevo
        </Button>
      </div>
    );
  }

  if (exportStatus?.status === 'failed') {
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm text-error">Export fallido</span>
        <Button onClick={handleGenerate} variant="outline" size="sm" disabled={!jobCompleted}>
          <FileSpreadsheet className="h-4 w-4 mr-1" />
          Generar nuevo
        </Button>
      </div>
    );
  }

  if (isInFlight) {
    return (
      <div className="flex items-center gap-3">
        <Loader2 className="h-4 w-4 animate-spin text-accent" />
        <span className="text-sm text-muted-foreground">Generando Excel...</span>
        <StatusBadge status={activeExport?.status ?? 'processing'} />
      </div>
    );
  }

  return (
    <Button
      onClick={handleGenerate}
      disabled={!jobCompleted || createExport.isPending}
      size="sm"
    >
      {createExport.isPending ? (
        <Loader2 className="h-4 w-4 animate-spin mr-1" />
      ) : (
        <FileSpreadsheet className="h-4 w-4 mr-1" />
      )}
      Generar Excel
    </Button>
  );
}
