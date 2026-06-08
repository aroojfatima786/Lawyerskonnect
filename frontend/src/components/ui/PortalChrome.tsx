import type { ReactNode } from 'react';

export function PortalChrome({
  label,
  children,
  className = '',
  statusDot = true,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  statusDot?: boolean;
}) {
  return (
    <div
      className={`overflow-hidden rounded-2xl border border-[#1e3a8f]/20 bg-white shadow-[0_8px_24px_-8px_rgba(15,23,42,0.18)] ring-1 ring-[#1e3a8f]/10 ${className}`}
    >
      <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-[#eef3fa] to-white px-3 py-2.5 sm:px-4">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[#1e3a8f] sm:text-[11px]">{label}</span>
        {statusDot ? <span className="h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-emerald-100" aria-hidden /> : null}
      </div>
      <div className="p-3 sm:p-4">{children}</div>
    </div>
  );
}
