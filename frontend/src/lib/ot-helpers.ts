import type { BadgeStatus } from '@/components/kronos';

/** Generate a display label for an OT using its name (preferred) or short UUID fallback */
export function otDisplayName(name: string | null | undefined, jobId: string): string {
  return name ? `OT-${name}` : `OT-${jobId.slice(-4).toUpperCase()}`;
}

/** Map backend job status to UI badge status */
export function mapStatus(job: { status: string; processed_count: number; file_count: number }): BadgeStatus {
  switch (job.status) {
    case 'pending':
    case 'processing':
      return 'processing';
    case 'completed':
      return job.processed_count < job.file_count ? 'partial' : 'ready';
    case 'failed':
      return 'error';
    default:
      return 'error';
  }
}

/** Validate that a download URL points to an expected domain */
export function isValidDownloadUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}
