import type { ReactNode } from 'react';

export function SectionHeader({
  kicker,
  title,
  subtitle,
  action,
  align = 'left',
  className = '',
}: {
  kicker?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  align?: 'left' | 'center';
  className?: string;
}) {
  const alignCls = align === 'center' ? 'text-center mx-auto' : '';
  return (
    <div className={`flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between ${className}`}>
      <div className={`max-w-3xl ${alignCls}`}>
        {kicker ? (
          <p className="public-kicker mb-2">{kicker}</p>
        ) : null}
        <h2 className={`lk-section-title font-serif text-2xl sm:text-3xl ${align === 'center' ? 'mx-auto' : ''}`}>{title}</h2>
        {subtitle ? <p className={`mt-2 text-sm leading-relaxed text-lk-muted sm:text-base ${alignCls}`}>{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
