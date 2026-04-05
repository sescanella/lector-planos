import { FileText, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatFileSize } from '@/lib/utils';
import type { UploadFile } from '@/types/upload';

interface FileListProps {
  files: UploadFile[];
  onRetry: (fileId: string) => void;
  onRemove: (fileId: string) => void;
}

const statusColors: Record<string, string> = {
  pending: 'text-muted-foreground',
  uploading: 'text-accent',
  completed: 'text-success',
  failed: 'text-error',
};

export function FileList({ files, onRetry, onRemove }: FileListProps) {
  if (files.length === 0) return null;

  return (
    <div className="space-y-1 max-h-60 overflow-y-auto">
      {files.map(file => (
        <div key={file.id} className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm">
          <FileText className={`h-4 w-4 shrink-0 ${statusColors[file.status] ?? ''}`} />
          <div className="flex-1 min-w-0">
            <p className="truncate font-medium">{file.file.name}</p>
            <p className="text-xs text-muted-foreground">{formatFileSize(file.file.size)}</p>
          </div>
          {file.status === 'uploading' && (
            <div className="w-20">
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-accent transition-all duration-300"
                  style={{ width: `${file.progress}%` }}
                  role="progressbar"
                  aria-valuenow={file.progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`Subiendo ${file.file.name}: ${file.progress}%`}
                />
              </div>
              <p className="text-xs text-center text-muted-foreground mt-0.5">{file.progress}%</p>
            </div>
          )}
          {file.status === 'completed' && (
            <span className="text-xs text-success font-medium">Listo</span>
          )}
          {file.status === 'failed' && (
            <div className="flex items-center gap-1">
              <span className="text-xs text-error">{file.error ?? 'Error'}</span>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onRetry(file.id)} aria-label="Reintentar">
                <RotateCcw className="h-3 w-3" />
              </Button>
            </div>
          )}
          {file.status === 'pending' && (
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onRemove(file.id)} aria-label="Quitar archivo">
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
