import { useNavigate } from 'react-router-dom';
import { StatusBadge } from './StatusBadge';
import { formatDate } from '@/lib/utils';
import type { Job, Pagination } from '@/types/api';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface JobTableProps {
  jobs: Job[];
  pagination: Pagination;
  onPageChange: (page: number) => void;
}

export function JobTable({ jobs, pagination, onPageChange }: JobTableProps) {
  const navigate = useNavigate();

  const start = (pagination.page - 1) * pagination.limit + 1;
  const end = Math.min(pagination.page * pagination.limit, pagination.total);

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" aria-label="Lista de jobs de extracción">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left font-medium">Job</th>
              <th className="px-4 py-3 text-left font-medium">Fecha</th>
              <th className="px-4 py-3 text-center font-medium">Archivos</th>
              <th className="px-4 py-3 text-center font-medium">Procesados</th>
              <th className="px-4 py-3 text-center font-medium">Estado</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map(job => (
              <tr
                key={job.job_id}
                className="border-b hover:bg-muted/30 cursor-pointer transition-colors"
                onClick={() => navigate(`/jobs/${job.job_id}`)}
              >
                <td className="px-4 py-3 font-medium">{job.job_id.slice(0, 8)}...</td>
                <td className="px-4 py-3 text-muted-foreground">{formatDate(job.created_at)}</td>
                <td className="px-4 py-3 text-center">{job.file_count}</td>
                <td className="px-4 py-3 text-center">{job.processed_count}</td>
                <td className="px-4 py-3 text-center"><StatusBadge status={job.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pagination.total > 0 && (
        <div className="flex items-center justify-between px-4 py-3 text-sm text-muted-foreground">
          <span>Mostrando {start}-{end} de {pagination.total}</span>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={pagination.page <= 1}
              onClick={() => onPageChange(pagination.page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={pagination.page >= pagination.total_pages}
              onClick={() => onPageChange(pagination.page + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
