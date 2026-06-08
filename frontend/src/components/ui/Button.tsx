import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'warning';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  leftIcon,
  rightIcon,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  const baseStyles =
    'inline-flex items-center justify-center font-semibold rounded-xl transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap';

  const variants = {
    primary:
      'bg-lk-accent text-white hover:bg-blue-700 focus-visible:ring-lk-accent shadow-md shadow-lk-accent/20 motion-safe:transition-shadow motion-safe:hover:shadow-lg motion-safe:hover:shadow-lk-accent/25',
    secondary:
      'bg-[#1a4570] text-white hover:bg-[#174066] focus-visible:ring-[#1a4570] shadow-md shadow-[#1a4570]/15',
    outline:
      'border border-lk-border bg-white text-lk-navy hover:bg-slate-50 hover:border-slate-300 focus-visible:ring-lk-accent',
    ghost: 'text-lk-navy hover:bg-slate-100 focus-visible:ring-slate-300',
    danger:
      'bg-lk-danger text-white hover:bg-red-600 focus-visible:ring-lk-danger shadow-sm',
    warning:
      'bg-amber-500 text-white hover:bg-amber-600 focus-visible:ring-amber-500 shadow-md shadow-amber-500/20',
  };

  const sizes = {
    sm: 'min-h-[36px] px-3 py-2 text-sm gap-1.5',
    md: 'min-h-[42px] px-4 py-2.5 text-sm gap-2',
    lg: 'min-h-[48px] px-6 py-3 text-base gap-2.5',
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden>
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      ) : (
        <>
          {leftIcon && <span className="flex-shrink-0">{leftIcon}</span>}
          {children}
          {rightIcon && <span className="flex-shrink-0">{rightIcon}</span>}
        </>
      )}
    </button>
  );
}
