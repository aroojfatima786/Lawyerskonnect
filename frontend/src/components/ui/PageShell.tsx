import React from 'react';

type Width = 'default' | 'wide';

/** Consistent page width + padding wrapper for marketing/dashboard inner sections */
export function PageShell({
  children,
  className = '',
  width = 'default',
}: {
  children: React.ReactNode;
  className?: string;
  width?: Width;
}) {
  const cls = width === 'wide' ? 'lk-page-wide' : 'lk-page';
  return <div className={`${cls} ${className}`}>{children}</div>;
}
