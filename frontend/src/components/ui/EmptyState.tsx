import type { ReactNode } from 'react';

export function EmptyState({
  icon,
  title,
  description,
  action,
  className = '',
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-2xl border border-dashed border-lk-border bg-gradient-to-b from-white to-slate-50/80 px-6 py-12 text-center shadow-lk-card ring-1 ring-slate-100/80 ${className}`}
    >
      {icon ? (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-lk-navy/5 to-blue-50 text-2xl text-lk-accent shadow-inner ring-1 ring-slate-100">
          {icon}
        </div>
      ) : null}
      <h3 className="text-lg font-semibold text-lk-navy">{title}</h3>
      {description ? <p className="mt-2 max-w-md text-sm leading-relaxed text-lk-muted">{description}</p> : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
