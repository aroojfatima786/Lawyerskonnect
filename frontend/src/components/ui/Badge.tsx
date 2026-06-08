import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'info';
  size?: 'sm' | 'md';
  className?: string;
}

export function Badge({ children, variant = 'primary', size = 'md', className = '' }: BadgeProps) {
  const variants = {
    primary: 'bg-blue-50 text-lk-accent ring-1 ring-inset ring-blue-100',
    secondary: 'bg-slate-100 text-lk-navy ring-1 ring-inset ring-slate-200',
    success: 'bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-100',
    warning: 'bg-amber-50 text-amber-900 ring-1 ring-inset ring-amber-100',
    danger: 'bg-red-50 text-red-800 ring-1 ring-inset ring-red-100',
    info: 'bg-sky-50 text-sky-800 ring-1 ring-inset ring-sky-100',
  };

  const sizes = {
    sm: 'px-2 py-0.5 text-xs font-medium',
    md: 'px-2.5 py-1 text-xs font-semibold sm:text-sm',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {children}
    </span>
  );
}

/** Plain status text — not button-shaped (use for workflow states). */
export function StatusLabel({ status }: { status: string }) {
  const key = String(status || '').toLowerCase();
  const map: Record<string, { label: string; text: string; dot: string }> = {
    pending: { label: 'Pending', text: 'text-amber-700', dot: 'bg-amber-500' },
    confirmed: { label: 'Confirmed', text: 'text-emerald-700', dot: 'bg-emerald-500' },
    completed: { label: 'Completed', text: 'text-blue-950', dot: 'bg-lk-accent' },
    cancelled: { label: 'Cancelled', text: 'text-red-700', dot: 'bg-red-500' },
    verified: { label: 'Verified', text: 'text-emerald-700', dot: 'bg-emerald-500' },
    rejected: { label: 'Rejected', text: 'text-red-700', dot: 'bg-red-500' },
    no_show: { label: 'No show', text: 'text-red-700', dot: 'bg-red-500' },
    rescheduled: { label: 'Rescheduled', text: 'text-sky-800', dot: 'bg-sky-500' },
    processing: { label: 'Processing', text: 'text-amber-700', dot: 'bg-amber-500' },
    paid: { label: 'Paid', text: 'text-emerald-700', dot: 'bg-emerald-500' },
    success: { label: 'Paid', text: 'text-emerald-700', dot: 'bg-emerald-500' },
    escrow: { label: 'Escrow', text: 'text-amber-800', dot: 'bg-amber-500' },
    urgent: { label: 'Urgent', text: 'text-red-700', dot: 'bg-red-500' },
    failed: { label: 'Failed', text: 'text-red-700', dot: 'bg-red-500' },
    refunded: { label: 'Refunded', text: 'text-amber-800', dot: 'bg-amber-500' },
    declined: { label: 'Declined', text: 'text-red-700', dot: 'bg-red-500' },
    held: { label: 'In escrow', text: 'text-amber-800', dot: 'bg-amber-500' },
    eligible: { label: 'Eligible', text: 'text-sky-800', dot: 'bg-sky-500' },
    eligible_for_release: { label: 'Eligible for release', text: 'text-sky-800', dot: 'bg-sky-500' },
    released: { label: 'Released', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  };
  const hit = map[key] || { label: status || '—', text: 'text-slate-600', dot: 'bg-slate-400' };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${hit.text}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${hit.dot}`} aria-hidden />
      {hit.label}
    </span>
  );
}

/** @deprecated Prefer `StatusLabel` — kept for imports; renders non-button status text. */
export function StatusBadge({ status }: { status: string }) {
  return <StatusLabel status={status} />;
}
