import type { ReactNode } from 'react';
import { FiCalendar } from 'react-icons/fi';
import { PortalChrome } from '../ui/PortalChrome';
import { Avatar } from '../ui/Avatar';
import { AppointmentMilestoneStrip } from './AppointmentMilestoneStrip';
import { bookingRef, formatAppointmentSchedule } from './appointmentUtils';

export function AppointmentCardShell({
  appointment,
  personName,
  paymentLabel,
  statusLabel,
  profilePictureUrl,
  feeNote,
  metaNote,
  children,
  showFlow = true,
}: {
  appointment: {
    _id?: string;
    id?: string;
    status?: string;
    isPaid?: boolean;
    appointmentDate?: string | Date;
    startTime?: string;
    endTime?: string;
    consultationType?: string;
    caseCategory?: string;
    fee?: number;
  };
  personName: string;
  paymentLabel?: string;
  statusLabel?: string;
  profilePictureUrl?: string;
  feeNote?: ReactNode;
  metaNote?: ReactNode;
  children?: ReactNode;
  /** When false, hides milestone flow (e.g. dashboard next-consultation preview). */
  showFlow?: boolean;
}) {
  const { date, time, mode } = formatAppointmentSchedule(appointment);
  const ref = bookingRef(appointment);

  return (
    <div className="overflow-hidden rounded-2xl border border-blue-200/70 bg-gradient-to-br from-blue-50/50 via-white to-sky-50/40 p-3 shadow-[0_12px_32px_-16px_rgba(15,23,42,0.12)] ring-1 ring-blue-200/50 sm:p-4">
      {showFlow ? (
        <PortalChrome label={`Appointment #${ref}`} statusDot={appointment.status !== 'cancelled'}>
          <AppointmentMilestoneStrip status={String(appointment.status || '')} isPaid={appointment.isPaid} />
        </PortalChrome>
      ) : (
        <div className="flex items-center justify-between gap-2 border-b border-[#1e3a8f]/10 pb-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#1e3a8f]">
            Appointment #{ref}
          </span>
          <span className="h-2 w-2 rounded-full bg-blue-500 ring-2 ring-blue-100" aria-hidden />
        </div>
      )}

      <div className={`rounded-xl border border-slate-100 bg-white/95 p-3 shadow-sm ring-1 ring-slate-100/80 ${showFlow ? 'mt-3' : 'mt-2'}`}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            {profilePictureUrl ? (
              <Avatar src={profilePictureUrl} name={personName} size="md" className="shrink-0" />
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#12355B] to-[#1e3a8f] text-white shadow-md">
                <FiCalendar className="text-base" aria-hidden />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-bold text-lk-navy">{personName}</p>
                {paymentLabel ? (
                  <span className="rounded-full bg-[#eef3fb] px-2.5 py-0.5 text-[11px] font-semibold text-lk-navy ring-1 ring-[#b8c9e8]/80">
                    {paymentLabel}
                  </span>
                ) : null}
                {statusLabel ? (
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold capitalize text-lk-navy ring-1 ring-slate-200/80">
                    {statusLabel}
                  </span>
                ) : null}
              </div>
              <p className="mt-0.5 text-xs text-lk-muted">
                {date} · {time} · {mode}
              </p>
              {appointment.caseCategory ? (
                <p className="mt-0.5 text-[11px] font-medium text-[#1e3a8f]">{appointment.caseCategory}</p>
              ) : null}
              {feeNote ? <div className="mt-1">{feeNote}</div> : null}
              {metaNote ? <div className="mt-2">{metaNote}</div> : null}
            </div>
          </div>
          {children ? (
            <div className="flex flex-wrap items-center gap-2 lg:max-w-[min(100%,22rem)] lg:shrink-0 lg:justify-end">
              {children}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
