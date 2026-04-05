import { useCallback, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { UPLOAD } from '@/constants';

interface DropZoneProps {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
}

export function DropZone({ onFiles, disabled = false }: DropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateAndEmit = useCallback((fileList: FileList | File[]) => {
    setError(null);
    const files = Array.from(fileList);

    const nonPdf = files.filter(f => !f.name.toLowerCase().endsWith('.pdf'));
    if (nonPdf.length > 0) {
      setError(`Solo se aceptan archivos PDF. Rechazados: ${nonPdf.map(f => f.name).join(', ')}`);
      return;
    }

    if (files.length > UPLOAD.MAX_FILES) {
      setError(`Máximo ${UPLOAD.MAX_FILES} archivos por batch.`);
      return;
    }

    const tooLarge = files.filter(f => f.size > UPLOAD.MAX_FILE_SIZE_BYTES);
    if (tooLarge.length > 0) {
      setError(`Archivos superan 50MB: ${tooLarge.map(f => f.name).join(', ')}`);
      return;
    }

    onFiles(files);
  }, [onFiles]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (disabled) return;
    validateAndEmit(e.dataTransfer.files);
  }, [disabled, validateAndEmit]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragOver(true);
  }, [disabled]);

  return (
    <div>
      <div
        className={cn(
          'relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors',
          isDragOver ? 'border-primary bg-primary/5' : 'border-border',
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-primary/50',
        )}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={() => setIsDragOver(false)}
        onClick={() => !disabled && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label="Zona de carga de archivos PDF. Arrastra archivos o haz clic para seleccionar."
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click(); } }}
      >
        <Upload className="h-10 w-10 text-muted-foreground mb-3" />
        <p className="text-sm font-medium">Arrastra archivos PDF aquí</p>
        <p className="text-xs text-muted-foreground mt-1">
          o haz clic para seleccionar (máx. {UPLOAD.MAX_FILES} archivos, 50MB c/u)
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf"
          multiple
          className="hidden"
          onChange={(e) => { if (e.target.files) validateAndEmit(e.target.files); e.target.value = ''; }}
          disabled={disabled}
        />
      </div>
      {error && (
        <p className="mt-2 text-sm text-error" role="alert">{error}</p>
      )}
    </div>
  );
}
