import { useEffect, useRef, useState } from 'react';
import { FiMoreVertical } from 'react-icons/fi';

export function MessageActionsMenu({
  onDelete,
  onEdit,
}: {
  onDelete: () => void;
  onEdit?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0 self-start">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-7 w-7 items-center justify-center rounded-lg text-white/80 opacity-100 transition hover:bg-white/15 hover:text-white sm:opacity-0 sm:group-hover:opacity-100"
        aria-label="Message options"
      >
        <FiMoreVertical className="text-sm" />
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-20 mt-1 min-w-[9rem] overflow-hidden rounded-xl border border-slate-200/90 bg-white py-1 shadow-lg ring-1 ring-slate-100">
          {onEdit ? (
            <button
              type="button"
              className="flex w-full px-3 py-2 text-left text-sm text-lk-navy hover:bg-slate-50"
              onClick={() => {
                setOpen(false);
                onEdit();
              }}
            >
              Edit
            </button>
          ) : null}
          <button
            type="button"
            className="flex w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
          >
            Delete
          </button>
        </div>
      ) : null}
    </div>
  );
}
