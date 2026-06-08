import React from 'react';

type Align = 'left' | 'center' | 'right';

export type TableColumn<T> = {
  key: string;
  header: React.ReactNode;
  align?: Align;
  className?: string;
  cell: (row: T) => React.ReactNode;
};

type TableProps<T> = {
  columns: TableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  emptyMessage?: string;
  errorMessage?: string;
  className?: string;
};

export function Table<T>({
  columns,
  rows,
  rowKey,
  loading,
  emptyMessage = 'No records to display.',
  errorMessage,
  className = '',
}: TableProps<T>) {
  const alignClass = (a?: Align) =>
    a === 'center' ? 'text-center' : a === 'right' ? 'text-right' : 'text-left';

  return (
    <div className={`overflow-x-auto rounded-2xl border border-lk-border bg-lk-surface shadow-lk-card ${className}`}>
      <table className="min-w-full divide-y divide-lk-border text-sm">
        <thead className="bg-slate-50/90">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={`whitespace-nowrap px-4 py-3 font-semibold text-lk-navy ${alignClass(col.align)} ${col.className || ''}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-lk-border bg-white">
          {loading ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-12 text-center text-lk-muted">
                Loading…
              </td>
            </tr>
          ) : errorMessage ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-12 text-center text-lk-danger">
                {errorMessage}
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-12 text-center text-lk-muted">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={rowKey(row)} className="transition-colors hover:bg-slate-50/80">
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`whitespace-nowrap px-4 py-3 text-slate-700 ${alignClass(col.align)} ${col.className || ''}`}
                  >
                    {col.cell(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
