import React, { forwardRef } from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, leftIcon, rightIcon, className = '', ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="mb-2 block text-sm font-semibold text-lk-navy">
            {label}
            {props.required && <span className="ml-1 text-lk-danger">*</span>}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-lk-muted">
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            className={`
              min-h-[42px] w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-lk-navy
              placeholder:text-lk-muted
              focus:outline-none focus:ring-2 focus:ring-lk-accent/35 focus:border-lk-accent
              disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-lk-muted
              ${leftIcon ? 'pl-10' : ''}
              ${rightIcon ? 'pr-10' : ''}
              ${error ? 'border-lk-danger focus:border-lk-danger focus:ring-lk-danger/30' : 'border-lk-border'}
              ${className}
            `}
            {...props}
          />
          {rightIcon && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-lk-muted">
              {rightIcon}
            </div>
          )}
        </div>
        {error && <p className="mt-1.5 text-sm text-lk-danger">{error}</p>}
        {helperText && !error && <p className="mt-1.5 text-sm text-lk-muted">{helperText}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, helperText, className = '', ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="mb-2 block text-sm font-semibold text-lk-navy">
            {label}
            {props.required && <span className="ml-1 text-lk-danger">*</span>}
          </label>
        )}
        <textarea
          ref={ref}
          className={`
            w-full rounded-xl border bg-white px-4 py-3 text-sm text-lk-navy
            placeholder:text-lk-muted
            focus:outline-none focus:ring-2 focus:ring-lk-accent/35 focus:border-lk-accent
            disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-lk-muted
            resize-none
            ${error ? 'border-lk-danger focus:border-lk-danger focus:ring-lk-danger/30' : 'border-lk-border'}
            ${className}
          `}
          {...props}
        />
        {error && <p className="mt-1.5 text-sm text-lk-danger">{error}</p>}
        {helperText && !error && <p className="mt-1.5 text-sm text-lk-muted">{helperText}</p>}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';
