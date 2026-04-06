export interface ProgressBarProps {
  value: number;
  showPercentage?: boolean;
}

export function ProgressBar({ value, showPercentage = true }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, value));

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-1 bg-white/8 rounded-none" role="progressbar" aria-valuenow={clamped} aria-valuemin={0} aria-valuemax={100}>
        <div
          className="h-full bg-[#0A4C95] transition-all duration-500 ease-out"
          style={{ width: `${clamped}%` }}
        />
      </div>
      {showPercentage && (
        <span className="font-heading text-[13px] font-semibold text-white/60">
          {Math.round(clamped)}%
        </span>
      )}
    </div>
  );
}
