import type { ReactNode } from 'react';
import { FaStar } from 'react-icons/fa';
import { FiCalendar } from 'react-icons/fi';
import { PortalChrome } from '../ui/PortalChrome';
import { bookingRef } from '../appointments/appointmentUtils';

export function ReviewPortalCard({
  label,
  personName,
  personInitial,
  specialty,
  rating,
  comment,
  dateLabel,
  verifiedText,
  actions,
}: {
  label: string;
  personName: string;
  personInitial: string;
  specialty?: string;
  rating: number;
  comment?: string;
  dateLabel: string;
  verifiedText?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-4 shadow-lk-card-md ring-1 ring-slate-100/80 sm:p-5">
      <PortalChrome label={label}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-sm font-bold text-white shadow-md">
              {personInitial}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-lk-navy">{personName}</p>
              {specialty ? <p className="text-[11px] text-lk-muted">{specialty}</p> : null}
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <FaStar key={i} className={i <= rating ? 'text-amber-500' : 'text-slate-200'} size={12} />
                  ))}
                </div>
                <span className="text-xs font-bold text-lk-navy">{rating.toFixed(1)}</span>
                <span className="flex items-center gap-1 text-[10px] text-lk-muted">
                  <FiCalendar className="shrink-0" />
                  {dateLabel}
                </span>
              </div>
            </div>
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
        </div>
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2.5 text-sm leading-relaxed text-lk-navy">
          {comment ? `“${comment}”` : <span className="italic text-lk-muted">No written comment.</span>}
        </p>
        {verifiedText ? <p className="mt-2 text-[10px] font-medium text-lk-muted">{verifiedText}</p> : null}
      </PortalChrome>
    </div>
  );
}

export function reviewLabelFromAppointment(appointmentId?: string) {
  if (!appointmentId) return 'Post-consult review';
  return `Review · ${bookingRef({ _id: appointmentId })}`;
}
