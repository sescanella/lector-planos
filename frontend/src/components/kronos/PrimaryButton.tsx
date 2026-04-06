import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface PrimaryButtonProps {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
  fullWidth?: boolean;
  asChild?: boolean;
  className?: string;
}

export function PrimaryButton({
  children,
  onClick,
  disabled = false,
  type = 'button',
  fullWidth = false,
  className,
}: PrimaryButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center gap-2',
        'bg-accent text-white font-sans text-sm font-bold tracking-[0.15em] uppercase',
        'rounded-none px-6 py-3',
        'transition-colors duration-150 ease-in-out',
        'hover:bg-[#E64A19]',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-[3px]',
        'disabled:bg-white/[0.08] disabled:text-white/30 disabled:cursor-not-allowed disabled:pointer-events-none',
        fullWidth && 'w-full',
        className,
      )}
    >
      {children}
    </button>
  );
}
