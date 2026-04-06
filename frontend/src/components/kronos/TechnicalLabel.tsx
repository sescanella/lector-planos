export interface TechnicalLabelProps {
  system: string;
  name: string;
  metadata?: string;
}

export function TechnicalLabel({ system, name, metadata }: TechnicalLabelProps) {
  const label = `${system} — ${name}`;

  return (
    <div className="flex items-center gap-4">
      <span
        className="font-heading text-[10px] leading-none text-accent"
        aria-hidden="true"
      >
        ◆
      </span>
      <span className="font-heading text-[11px] font-semibold tracking-[0.3em] uppercase text-white/85">
        {label}
      </span>
      {metadata && (
        <>
          <div className="w-[60px] h-px bg-white/20" aria-hidden="true" />
          <span className="font-heading text-[11px] tracking-[0.08em] text-white/40">
            {metadata}
          </span>
        </>
      )}
    </div>
  );
}
