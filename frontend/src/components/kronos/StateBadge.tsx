import { cn } from '@/lib/utils';

export type BadgeStatus = 'processing' | 'ready' | 'partial' | 'error';

export interface StateBadgeProps {
  status: BadgeStatus;
  animated?: boolean;
}

const STATUS_CONFIG: Record<
  BadgeStatus,
  { dotColor: string; textColor: string; bgColor: string; label: string }
> = {
  processing: {
    dotColor: 'text-[#0A4C95]',
    textColor: 'text-[#5B9BD5]',
    bgColor: 'bg-[rgba(10,76,149,0.15)]',
    label: 'PROCESANDO',
  },
  ready: {
    dotColor: 'text-[#4ADE80]',
    textColor: 'text-[#4ADE80]',
    bgColor: 'bg-[rgba(74,222,128,0.15)]',
    label: 'LISTA',
  },
  partial: {
    dotColor: 'text-[#FBBF24]',
    textColor: 'text-[#FBBF24]',
    bgColor: 'bg-[rgba(251,191,36,0.15)]',
    label: 'PARCIAL',
  },
  error: {
    dotColor: 'text-[#F87171]',
    textColor: 'text-[#F87171]',
    bgColor: 'bg-[rgba(248,113,113,0.15)]',
    label: 'ERROR',
  },
};

export function StateBadge({ status, animated = false }: StateBadgeProps) {
  const config = STATUS_CONFIG[status];
  const shouldPulse = animated && status === 'processing';

  return (
    <span
      role="status"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5',
        config.bgColor,
      )}
    >
      <span
        className={cn(
          'text-[8px]',
          config.dotColor,
          shouldPulse && 'animate-[pulse_2s_ease-in-out_infinite] motion-reduce:animate-none',
        )}
        aria-hidden="true"
      >
        ●
      </span>
      <span
        className={cn(
          'font-heading text-[11px] font-semibold tracking-[0.15em] uppercase',
          config.textColor,
        )}
      >
        {config.label}
      </span>
    </span>
  );
}
