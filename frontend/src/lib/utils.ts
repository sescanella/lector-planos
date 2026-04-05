import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string): string {
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

export function formatFileSize(bytes: number | string): string {
  const n = typeof bytes === 'string' ? Number(bytes) : bytes;
  if (!Number.isFinite(n)) return '-';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export type ConfidenceLevel = 'alta' | 'media' | 'baja';

export function getConfidenceLevel(score: number): ConfidenceLevel {
  if (score >= 0.85) return 'alta';
  if (score >= 0.60) return 'media';
  return 'baja';
}

export function getConfidenceColor(score: number): string {
  const level = getConfidenceLevel(score);
  switch (level) {
    case 'alta': return 'bg-success text-white';
    case 'media': return 'bg-warning text-foreground';
    case 'baja': return 'bg-error text-white';
  }
}

export function isLowConfidence(score: number): boolean {
  return score < 0.60;
}
