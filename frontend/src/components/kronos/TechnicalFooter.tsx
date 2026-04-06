export interface TechnicalFooterProps {
  items: string[];
}

export function TechnicalFooter({ items }: TechnicalFooterProps) {
  return (
    <div className="flex flex-wrap items-center gap-4 font-heading text-[10px] font-semibold tracking-[0.25em] uppercase text-white/30">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-4">
          {i > 0 && (
            <span
              className="text-[6px] text-[rgba(255,120,0,0.6)]"
              aria-hidden="true"
            >
              ●
            </span>
          )}
          <span>{item}</span>
        </span>
      ))}
    </div>
  );
}
