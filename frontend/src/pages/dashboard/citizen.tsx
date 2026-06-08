import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  FiCalendar,
  FiMessageSquare,
  FiCreditCard,
  FiSearch,
  FiCheck,
  FiBell,
  FiAlertCircle,
  FiShield,
  FiClock,
} from 'react-icons/fi';
import { useAuth } from '../../context/AuthContext';
import { appointmentApi, notificationApi, chatApi } from '../../services/api';
import { Card, CardHeader, Button, StatusBadge, Badge } from '../../components/ui';
import { AppointmentCardShell } from '../../components/appointments/AppointmentCardShell';
import { consultationPaymentLabel } from '../../components/appointments/appointmentUtils';

export default function CitizenDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<any>(null);
  const [upcomingAppointments, setUpcomingAppointments] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [chatUnread, setChatUnread] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const [statsRes, appointmentsRes, notificationsRes, chatUnreadRes] = await Promise.all([
        appointmentApi.getStats(),
        appointmentApi.getUpcoming(10),
        notificationApi.getAll(1, 5),
        chatApi.getUnreadCount().catch(() => ({})),
      ]);
      setStats((statsRes as any)?.data ?? null);
      const raw = appointmentsRes as any;
      const list = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
      setUpcomingAppointments(list);
      setNotifications((notificationsRes as any).data || []);
      const cu: any = chatUnreadRes;
      setChatUnread(Number(cu?.count ?? cu?.data?.count ?? 0));
    } catch {
      /* empty states */
    } finally {
      setLoading(false);
    }
  };

  const pendingPayments = useMemo(
    () =>
      upcomingAppointments.filter((a) => !a.isPaid && String(a.status).toLowerCase() === 'confirmed').length,
    [upcomingAppointments],
  );

  const nextAppointment = upcomingAppointments[0];
  const nextLawyerProfile = (nextAppointment?.lawyerId as any)?.lawyerProfile;
  const nextSt = String(nextAppointment?.status || '').toLowerCase();
  const nextLawyerUserId = (() => {
    const lid = nextAppointment?.lawyerId;
    if (!lid) return '';
    if (typeof lid === 'object' && '_id' in lid) return String((lid as { _id: string })._id);
    return String(lid);
  })();

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-lk-accent border-t-transparent motion-reduce:animate-none" />
      </div>
    );
  }

  const profileName = user?.citizenProfile?.fullName || user?.email?.split('@')[0] || 'there';

  return (
    <div className="space-y-5 lg:space-y-7">
      {/* Welcome — premium split hero */}
      <div className="overflow-hidden rounded-3xl border border-slate-200/90 bg-lk-surface shadow-lk-card-lg ring-1 ring-slate-100/90">
        <div className="grid lg:grid-cols-[1.15fr_0.85fr] lg:items-stretch">
          <div className="relative overflow-hidden bg-gradient-to-br from-lk-navy via-[#0f172a] to-[#1e3a8f] px-5 py-6 text-white sm:px-7 sm:py-8">
            <div className="pointer-events-none absolute -right-16 top-0 h-48 w-48 rounded-full bg-lk-accent/20 blur-3xl" />
            <div className="pointer-events-none absolute bottom-0 left-0 h-32 w-32 rounded-full bg-emerald-400/10 blur-2xl" />
            <div className="relative">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white/90 backdrop-blur-sm">
                <FiShield className="text-emerald-300" aria-hidden />
                Citizen portal
              </div>
              <h2 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl lg:text-[1.85rem] lg:leading-tight">
                Welcome back, {profileName}
              </h2>
              <p className="mt-3 max-w-lg text-sm leading-relaxed text-white/75 sm:text-[15px]">
                Consultations, escrow payments, and secure messaging — one workspace built for legal clarity.
              </p>
              <div className="mt-6 flex flex-wrap gap-2.5">
                <Link to="/client/find-lawyer">
                  <Button
                    size="md"
                    leftIcon={<FiSearch />}
                    className="shadow-lg shadow-black/20 motion-safe:transition-shadow motion-safe:hover:shadow-xl"
                  >
                    Find a lawyer
                  </Button>
                </Link>
                <Link to="/client/legal-guidance">
                  <Button
                    variant="outline"
                    size="md"
                    className="border-white/40 bg-white/15 !text-white hover:border-white/60 hover:bg-white/25 hover:!text-white"
                  >
                    AI Legal Guidance
                  </Button>
                </Link>
                <Link to="/client/appointments">
                  <Button
                    variant="outline"
                    size="md"
                    className="border-white/40 bg-white/15 !text-white hover:border-white/60 hover:bg-white/25 hover:!text-white"
                  >
                    Appointments
                  </Button>
                </Link>
              </div>
            </div>
          </div>

          <div className="flex flex-col justify-between border-t border-slate-200/80 bg-gradient-to-b from-slate-50/90 to-white p-5 sm:p-6 lg:border-l lg:border-t-0 lg:border-slate-200/80">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-lk-muted">Your overview</p>
              <div className="mt-3 grid grid-cols-2 gap-2.5">
                <HeroStatCard icon={<FiCalendar className="text-lg text-lk-accent" />} label="Upcoming" value={upcomingAppointments.length} hint="Appointments" />
                <HeroStatCard icon={<FiCreditCard className="text-lg text-lk-warning" />} label="Pending pay" value={pendingPayments} hint="Awaiting fee" />
                <HeroStatCard icon={<FiMessageSquare className="text-lg text-lk-accent" />} label="Unread" value={chatUnread} hint="Messages" />
                <HeroStatCard icon={<FiCheck className="text-lg text-lk-success" />} label="Completed" value={stats?.completed ?? 0} hint="Consultations" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {!user?.isProfileComplete && (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-200/90 bg-amber-50/95 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex gap-3">
            <FiAlertCircle className="mt-0.5 shrink-0 text-lg text-amber-700" aria-hidden />
            <div>
              <h3 className="font-semibold text-amber-950">Complete your profile</h3>
              <p className="text-sm leading-relaxed text-amber-900/90">Add your details so lawyers can confirm bookings faster.</p>
            </div>
          </div>
          <Link to="/client/profile">
            <Button size="sm">Complete profile</Button>
          </Link>
        </div>
      )}

      {pendingPayments > 0 && (
        <div className="rounded-2xl border border-amber-200/90 bg-gradient-to-r from-amber-50 to-white p-5 shadow-lk-card sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h3 className="text-sm font-bold uppercase tracking-wide text-amber-950">Payment required</h3>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-amber-950/90">
                Pay the consultation fee to unlock chat at the scheduled time. Your payment is held in escrow by LawyersKonnect until consultation
                rules are met.
              </p>
            </div>
            <Link to="/client/appointments" className="shrink-0">
              <Button size="md" className="shadow-md shadow-amber-500/10">
                Go to checkout
              </Button>
            </Link>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <Card className="lk-portal-card border-slate-200/90 shadow-lk-card-lg ring-1 ring-slate-100/80">
            <CardHeader
              title="Next consultation"
              subtitle="Your nearest confirmed or pending booking."
              action={
                <Link to="/client/appointments" className="text-sm font-semibold text-lk-accent hover:underline">
                  All appointments
                </Link>
              }
            />
            {!nextAppointment ? (
              <div className="rounded-xl border border-dashed border-lk-border bg-[#F3F7FD]/60 py-12 text-center">
                <FiCalendar className="mx-auto mb-3 text-4xl text-lk-border" aria-hidden />
                <p className="text-sm font-semibold text-lk-navy">No upcoming consultation</p>
                <p className="mx-auto mt-1 max-w-sm text-sm text-lk-muted">Choose a verified lawyer and book your first appointment.</p>
                <Link to="/client/find-lawyer" className="mt-5 inline-block">
                  <Button size="sm" leftIcon={<FiSearch />}>
                    Find lawyers
                  </Button>
                </Link>
              </div>
            ) : (
              <AppointmentCardShell
                showFlow={false}
                appointment={nextAppointment}
                personName={nextLawyerProfile?.fullName || 'Lawyer'}
                paymentLabel={consultationPaymentLabel(nextAppointment)}
                statusLabel={nextSt}
                profilePictureUrl={nextLawyerProfile?.profilePictureUrl}
                feeNote={
                  typeof nextAppointment.fee === 'number' && nextAppointment.fee > 0 ? (
                    <p className="text-sm text-lk-muted">
                      Consultation fee{' '}
                      <span className="font-semibold tabular-nums text-lk-navy">
                        PKR {nextAppointment.fee.toLocaleString()}
                      </span>
                    </p>
                  ) : null
                }
                metaNote={
                  !nextAppointment.isPaid &&
                  nextSt === 'confirmed' &&
                  typeof nextAppointment.fee === 'number' &&
                  nextAppointment.fee > 0 ? (
                    <div className="rounded-xl border border-amber-200/80 bg-gradient-to-r from-amber-50 to-orange-50/50 px-3 py-2.5">
                      <p className="text-[10px] font-bold uppercase text-amber-900">Escrow · payment required</p>
                      <p className="mt-0.5 text-xs text-amber-950">
                        Pay <span className="font-semibold">PKR {nextAppointment.fee.toLocaleString()}</span> to unlock
                        consultation chat.
                      </p>
                    </div>
                  ) : null
                }
              >
                <div className="flex flex-wrap items-center gap-2">
                  {!nextAppointment.isPaid && nextSt === 'confirmed' && (
                    <Link to={`/client/payments/checkout/${nextAppointment._id}`}>
                      <Button size="sm" variant="secondary">
                        Pay fee
                      </Button>
                    </Link>
                  )}
                  {nextLawyerUserId ? (
                    nextSt === 'confirmed' && !nextAppointment.isPaid ? (
                      <span
                        className="inline-flex h-9 items-center justify-center rounded-xl border border-dashed border-slate-200/90 bg-slate-50/80 px-3 text-lk-muted"
                        title="Payment required before consultation chat can start."
                      >
                        <FiMessageSquare className="h-4 w-4" />
                      </span>
                    ) : (
                      <Link
                        to={`/client/messages?userId=${nextLawyerUserId}`}
                        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-lk-navy px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
                      >
                        <FiMessageSquare className="h-4 w-4" /> Open chat
                      </Link>
                    )
                  ) : null}
                  <Link to="/client/appointments">
                    <Button size="sm" variant="secondary">
                      View details
                    </Button>
                  </Link>
                </div>
              </AppointmentCardShell>
            )}
          </Card>

          {/* Upcoming list (compact) */}
          <Card padding="none" className="lk-portal-card overflow-hidden border-slate-200/90 shadow-lk-card-lg ring-1 ring-slate-100/80">
            <div className="flex flex-col gap-3 border-b border-lk-border bg-gradient-to-r from-[#F3F7FD]/80 to-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div>
                <h3 className="lk-section-title">Upcoming appointments</h3>
                <p className="mt-1 text-sm text-lk-muted">Confirmed bookings and outstanding payments in your preview list.</p>
              </div>
              <Link to="/client/appointments" className="shrink-0 text-sm font-semibold text-lk-accent hover:underline">
                View all
              </Link>
            </div>
            <div className="p-5 sm:p-6">
              {upcomingAppointments.length === 0 ? (
                <p className="text-center text-sm text-lk-muted">No additional items in the upcoming preview.</p>
              ) : (
                <ul className="divide-y divide-lk-border rounded-xl border border-lk-border bg-lk-surface">
                  {upcomingAppointments.slice(0, 4).map((appointment) => {
                    const lp = (appointment.lawyerId as any)?.lawyerProfile;
                    const st = String(appointment.status || '').toLowerCase();
                    return (
                      <li key={appointment._id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="font-medium text-lk-navy">{lp?.fullName || 'Lawyer'}</p>
                          <p className="text-sm text-lk-muted">
                            {new Date(appointment.appointmentDate).toLocaleDateString()} · {appointment.startTime}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <StatusBadge status={appointment.status} />
                            {!appointment.isPaid && st === 'confirmed' ? (
                              <Badge variant="warning" size="sm">
                                Unpaid
                              </Badge>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2">
                          {!appointment.isPaid && st === 'confirmed' && (
                            <Link to={`/client/payments/checkout/${appointment._id}`}>
                              <Button size="sm">Pay</Button>
                            </Link>
                          )}
                          <Link to="/client/appointments">
                            <Button size="sm">View</Button>
                          </Link>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="lk-portal-card border-slate-200/90 shadow-lk-card-md ring-1 ring-slate-100/70">
            <CardHeader title="Shortcuts" />
            <div className="space-y-2">
              <Link to="/client/payments" className="block">
                <Button className="w-full justify-start bg-gradient-to-r from-lk-accent to-[#1e3a8f] hover:from-blue-600 hover:to-[#1e40af]" leftIcon={<FiCreditCard />}>
                  Payments & receipts
                </Button>
              </Link>
              <Link to="/client/reviews" className="block">
                <Button variant="secondary" className="w-full justify-start !bg-lk-navy !text-white hover:!bg-[#1e3a8f]" leftIcon={<FiCheck />}>
                  My reviews
                </Button>
              </Link>
              <Link to="/client/notifications" className="block">
                <Button variant="outline" className="w-full justify-start border-lk-accent/40 text-lk-accent hover:bg-blue-50" leftIcon={<FiBell />}>
                  Notifications
                </Button>
              </Link>
            </div>
          </Card>

          <Card className="lk-portal-card border-slate-200/90 shadow-lk-card-md ring-1 ring-slate-100/70">
            <CardHeader
              title="Recent activity"
              action={
                <Link to="/client/notifications" className="text-sm font-semibold text-lk-accent hover:underline">
                  View all
                </Link>
              }
            />
            {notifications.length === 0 ? (
              <div className="rounded-xl border border-dashed border-lk-border bg-slate-50/80 py-10 text-center">
                <FiBell className="mx-auto mb-2 text-2xl text-lk-border" aria-hidden />
                <p className="text-sm font-medium text-lk-navy">No recent notifications</p>
                <p className="mt-1 text-xs text-lk-muted">Appointment and payment updates will appear here.</p>
              </div>
            ) : (
              <ul className="relative ml-1 border-l border-lk-border pl-5">
                {notifications.slice(0, 5).map((notification) => (
                  <li key={notification._id} className="relative pb-5 last:pb-0">
                    <span
                      className={`absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white shadow-sm ${
                        !notification.isRead ? 'bg-lk-accent ring-2 ring-blue-100' : 'bg-slate-300 ring-1 ring-lk-border'
                      }`}
                      aria-hidden
                    />
                    <p className="text-sm font-semibold leading-snug text-lk-navy">{notification.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-lk-muted">{notification.message}</p>
                    <p className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-lk-muted">
                      <FiClock className="shrink-0 text-[10px]" aria-hidden />
                      {new Date(notification.createdAt).toLocaleString()}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="lk-portal-card border-slate-200/90 shadow-lk-card-md ring-1 ring-slate-100/70">
            <CardHeader title="Consultation summary" />
            <div className="space-y-2 text-sm text-lk-muted">
              <div className="flex items-center justify-between rounded-xl border border-lk-border bg-[#F3F7FD]/50 px-3 py-2.5">
                <span className="flex items-center gap-2">Cancelled</span>
                <span className="font-semibold tabular-nums text-lk-navy">{stats?.cancelled ?? 0}</span>
              </div>
              <p className="text-xs leading-relaxed">
                Need help? Use Help &amp; Support in the sidebar. When chat is unlocked, you can message your lawyer from Messages.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}


function HeroStatCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200/90 bg-white/95 p-3 shadow-sm ring-1 ring-slate-100/80 transition-shadow hover:shadow-md">
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-50 to-slate-50 ring-1 ring-slate-200/80">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xl font-bold tabular-nums text-lk-navy">{value}</p>
          <p className="text-[11px] font-semibold text-lk-navy">{label}</p>
          <p className="text-[10px] text-lk-muted">{hint}</p>
        </div>
      </div>
    </div>
  );
}
