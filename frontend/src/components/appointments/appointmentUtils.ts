export function bookingRef(appointment: { _id?: string; id?: string }) {
  const id = String(appointment._id ?? appointment.id ?? '');
  if (!id) return 'LK-NEW';
  return `LK-${id.slice(-6).toUpperCase()}`;
}

export function formatAppointmentSchedule(appointment: {
  appointmentDate?: string | Date;
  startTime?: string;
  endTime?: string;
  consultationType?: string;
}) {
  const date = appointment.appointmentDate
    ? new Date(appointment.appointmentDate).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '—';
  const time =
    appointment.startTime && appointment.endTime
      ? `${appointment.startTime} – ${appointment.endTime}`
      : appointment.startTime || '—';
  const mode = appointment.consultationType
    ? appointment.consultationType.charAt(0).toUpperCase() + appointment.consultationType.slice(1)
    : '—';
  return { date, time, mode };
}

export function consultationPaymentLabel(appointment: {
  fee?: number;
  isPaid?: boolean;
  status?: string;
}): string | undefined {
  const fee = Number(appointment.fee ?? 0);
  if (!fee) return undefined;
  if (!appointment.isPaid && String(appointment.status).toLowerCase() === 'confirmed') {
    return 'Paid consultation · payment pending';
  }
  return 'Paid consultation';
}
