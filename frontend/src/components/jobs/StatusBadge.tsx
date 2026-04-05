import { Badge } from '@/components/ui/badge';
import type { JobStatus, ExportStatus } from '@/types/api';

const statusConfig: Record<string, { label: string; variant: 'muted' | 'warning' | 'success' | 'destructive' }> = {
  pending: { label: 'Pendiente', variant: 'muted' },
  processing: { label: 'Procesando', variant: 'warning' },
  completed: { label: 'Completado', variant: 'success' },
  failed: { label: 'Fallido', variant: 'destructive' },
  uploaded: { label: 'Subido', variant: 'muted' },
  extracted: { label: 'Extraído', variant: 'success' },
};

interface StatusBadgeProps {
  status: JobStatus | ExportStatus | string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status] ?? { label: status, variant: 'muted' as const };

  return (
    <div aria-live="polite">
      <Badge variant={config.variant}>{config.label}</Badge>
    </div>
  );
}
