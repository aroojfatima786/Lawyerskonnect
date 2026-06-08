const LABELS = ['Requested', 'Confirmed', 'Paid', 'Consultation', 'Completed'] as const;

function resolveActiveIndex(status: string, isPaid?: boolean): number {
  const st = String(status || '').toLowerCase();
  if (st === 'completed') return 5;
  if (st === 'pending') return 0;
  if (st === 'confirmed' && !isPaid) return 1;
  if (st === 'confirmed' && isPaid) return 3;
  return 1;
}

function stepBarWidth(index: number, activeIndex: number): string {
  if (activeIndex >= 5) return '100%';
  if (index < activeIndex) return '100%';
  if (index > activeIndex) return '0%';
  if (index === 0) return '55%';
  if (index === 1) return '65%';
  if (index === 2) return '40%';
  if (index === 3) return '50%';
  return '0%';
}

export function AppointmentMilestoneStrip({ status, isPaid }: { status: string; isPaid?: boolean }) {
  const st = String(status || '').toLowerCase();

  if (st === 'cancelled') {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border border-red-100 bg-red-50/80 px-3 py-2.5 text-xs font-semibold text-red-800">
        <span className="h-2 w-2 rounded-full bg-red-500" aria-hidden />
        Consultation cancelled
      </div>
    );
  }

  const activeIndex = resolveActiveIndex(st, isPaid);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {LABELS.map((label, i) => {
          const done = activeIndex === 5 || i < activeIndex;
          const current = activeIndex < 5 && i === activeIndex;
          return (
            <span
              key={label}
              className={`rounded-full px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wide sm:text-[10px] ${
                done
                  ? 'bg-emerald-600 text-white'
                  : current
                    ? 'bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200/80'
                    : 'bg-slate-100 text-slate-500'
              }`}
            >
              {label}
              {done ? ' ✓' : current ? ' · in progress' : ''}
            </span>
          );
        })}
      </div>
      <div className="flex gap-1">
        {LABELS.map((label, i) => (
          <div key={label} className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#12355B] to-[#1e3a8f] transition-all duration-500"
              style={{ width: stepBarWidth(i, activeIndex) }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
