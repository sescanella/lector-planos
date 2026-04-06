export interface ErrorBannerProps {
  message: string;
}

export function ErrorBanner({ message }: ErrorBannerProps) {
  return (
    <div
      className="bg-[rgba(248,113,113,0.08)] border border-[rgba(248,113,113,0.2)] rounded-none py-2 px-3"
      role="alert"
    >
      <span className="text-[#F87171] font-heading text-[11px] font-semibold">
        {message}
      </span>
    </div>
  );
}
