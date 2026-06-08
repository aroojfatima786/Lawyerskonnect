
export type PremiumTabItem<T extends string> = {
  id: T;
  label: string;
  count?: number;
};

export function PremiumTabs<T extends string>({
  tabs,
  active,
  onChange,
  className = '',
  size = 'md',
}: {
  tabs: PremiumTabItem<T>[];
  active: T;
  onChange: (id: T) => void;
  className?: string;
  size?: 'sm' | 'md';
}) {
  const pad = size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm';
  return (
    <div
      className={`inline-flex max-w-full flex-wrap gap-1 rounded-2xl border border-slate-200/90 bg-slate-100/80 p-1 shadow-inner ring-1 ring-slate-100/80 ${className}`}
      role="tablist"
    >
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={`${pad} inline-flex items-center gap-2 rounded-xl font-semibold transition-all ${
              isActive
                ? 'bg-gradient-to-br from-lk-navy to-[#1e3a8f] text-white shadow-md shadow-slate-900/15 ring-1 ring-white/20'
                : 'text-lk-muted hover:bg-white/80 hover:text-lk-navy'
            }`}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 ? (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                  isActive ? 'bg-white/20 text-white' : 'bg-slate-200 text-lk-navy'
                }`}
              >
                {tab.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
