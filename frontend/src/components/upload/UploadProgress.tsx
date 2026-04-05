interface UploadProgressProps {
  completed: number;
  total: number;
  failed: number;
}

export function UploadProgress({ completed, total, failed }: UploadProgressProps) {
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">
          {completed} de {total} archivos subidos
          {failed > 0 && <span className="text-error ml-1">({failed} fallidos)</span>}
        </span>
        <span className="font-medium">{percent}%</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${percent}%` }}
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Progreso total: ${completed} de ${total} archivos`}
        />
      </div>
    </div>
  );
}
