import React, { forwardRef } from 'react';
import { FiChevronDown } from 'react-icons/fi';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  label?: string;
  error?: string;
  helperText?: string;
  options: SelectOption[];
  placeholder?: string;
}

/** Shared styles for native selects outside this component (availability, setup, admin filters). */
export const lkNativeSelectClassName =
  'min-h-[46px] w-full cursor-pointer appearance-none rounded-xl border border-lk-border bg-gradient-to-b from-white to-slate-50/90 px-4 py-2.5 pr-11 text-sm font-medium text-lk-navy shadow-sm transition-[border-color,box-shadow] duration-200 hover:border-lk-accent/45 hover:shadow-md focus:border-lk-accent focus:outline-none focus:ring-2 focus:ring-lk-accent/35 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-lk-muted';

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, helperText, options, placeholder, className = '', ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="mb-2 block text-sm font-semibold text-lk-navy">
            {label}
            {props.required && <span className="ml-1 text-lk-danger">*</span>}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            className={`
              ${lkNativeSelectClassName}
              ${error ? 'border-lk-danger focus:border-lk-danger focus:ring-lk-danger/30' : ''}
              ${className}
            `}
            {...props}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <div
            className="pointer-events-none absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg bg-[#eef3fb] text-lk-navy ring-1 ring-[#b8c9e8]/70"
            aria-hidden
          >
            <FiChevronDown className="h-4 w-4 shrink-0 opacity-80" />
          </div>
        </div>
        {error && <p className="mt-1.5 text-sm text-lk-danger">{error}</p>}
        {helperText && !error && <p className="mt-1.5 text-sm leading-relaxed text-lk-muted">{helperText}</p>}
      </div>
    );
  }
);

Select.displayName = 'Select';
