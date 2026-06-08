import type { ReactNode } from 'react';

const accentMap = {
  blue: {
    card: 'from-blue-500/10 via-white to-blue-50/30 ring-blue-100/80',
    icon: 'bg-blue-50 text-lk-accent',
  },
  navy: {
    card: 'from-slate-100/80 via-white to-slate-50 ring-slate-200/90',
    icon: 'bg-slate-100 text-lk-navy',
  },
  emerald: {
    card: 'from-emerald-500/10 via-white to-emerald-50/40 ring-emerald-100/80',
    icon: 'bg-emerald-50 text-emerald-700',
  },
  amber: {
    card: 'from-amber-500/10 via-white to-amber-50/40 ring-amber-100/80',
    icon: 'bg-amber-50 text-amber-800',
  },
  gold: {
    card: 'from-amber-400/12 via-white to-amber-50/50 ring-amber-200/70',
    icon: 'bg-gradient-to-br from-amber-100 to-amber-50 text-amber-900',
  },
};

export function StatCard({
  label,
  value,
  hint,
  icon,
  accent = 'blue',
  className = '',
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  accent?: keyof typeof accentMap;
  className?: string;
}) {
  const a = accentMap[accent];
  return (
    <div
      className={`lk-card-lift rounded-2xl border border-lk-border bg-gradient-to-br ${a.card} p-5 shadow-lk-card ring-1 ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-lk-muted">{label}</p>
          <p className="mt-1.5 text-2xl font-bold tabular-nums tracking-tight text-lk-navy sm:text-[1.65rem]">{value}</p>
          {hint ? <p className="mt-1 text-xs leading-relaxed text-lk-muted">{hint}</p> : null}
        </div>
        {icon ? <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-sm ${a.icon}`}>{icon}</div> : null}
      </div>
    </div>
  );
}
