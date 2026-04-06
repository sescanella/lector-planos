import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface OutlineButtonProps {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
  fullWidth?: boolean;
  asChild?: boolean;
  className?: string;
}

export function OutlineButton({
  children,
  onClick,
  disabled = false,
  type = 'button',
  fullWidth = false,
  className,
}: OutlineButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'border border-white/20 bg-transparent text-white/60',
        'font-sans text-sm font-bold tracking-[0.15em] uppercase',
        'rounded-none px-6 py-3',
        'transition-colors duration-150 ease-in-out',
        'hover:border-white/40 hover:text-white/85',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-[3px]',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        fullWidth && 'w-full',
        className,
      )}
    >
      {children}
    </button>
  );
}
