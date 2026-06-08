import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { FiCalendar, FiMessageSquare, FiStar, FiClock, FiCheck, FiCreditCard, FiShield } from 'react-icons/fi';
import { useAuth } from '../../context/AuthContext';
import { appointmentApi, subscriptionApi } from '../../services/api';
import {
  LAWYER_PLAN_PRICES,
  resolveLimitsFromUsage,
  normalizePlanSlug,
  resolvePlanDisplayStatus,
  PLAN_STATUS_LABELS,
} from '../../constants/lawyerSubscriptionPlans';
import { Card, CardHeader, Badge, StatusLabel, Button, Avatar } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';

export default function LawyerDashboard() {
  const { user } = useAuth();
  const toast = useToast();
  const [stats, setStats] = useState<any>(null);
  const [upcomingAppointments, setUpcomingAppointments] = useState<any[]>([]);
  const [subscriptionSummary, setSubscriptionSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const lawyerProfile = user?.lawyerProfile;
  const looksProfileComplete =
    !!lawyerProfile?.fullName &&
    !!lawyerProfile?.phoneNumber &&
    !!lawyerProfile?.city &&
    !!lawyerProfile?.barCouncilNumber &&
    Array.isArray(lawyerProfile?.practiceAreas) &&
    lawyerProfile.practiceAreas.length > 0;
  const shouldShowCompleteProfileBanner = !user?.isProfileComplete && !looksProfileComplete;
  const verificationStatus = String(lawyerProfile?.verificationStatus || '').toLowerCase();
  const shouldShowKycIncompleteBanner = verificationStatus !== 'verified';

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const [statsRes, appointmentsRes, subRes] = await Promise.all([
        appointmentApi.getStats(),
        appointmentApi.getUpcoming(10),
        subscriptionApi.getMySubscription().catch(() => null),
      ]);
      setStats((statsRes as any)?.data ?? null);
      setSubscriptionSummary((subRes as any)?.data ?? null);
      const raw = appointmentsRes as any;
      const list = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
      const newestFirst = [...list].sort((a, b) => {
        const aTs = new Date(a?.createdAt || a?.updatedAt || 0).getTime();
        const bTs = new Date(b?.createdAt || b?.updatedAt || 0).getTime();
        return bTs - aTs;
      });
      setUpcomingAppointments(newestFirst);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmAppointment = async (id: string) => {
    try {
      await appointmentApi.confirm(id);
      toast.success('Appointment confirmed');
      loadDashboardData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to confirm appointment');
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-lk-accent border-t-transparent" />
      </div>
    );
  }

  const pendingConfirmations = upcomingAppointments.filter((a) => String(a.status).toLowerCase() === 'pending').length;

  const profileName = lawyerProfile?.fullName || user?.email?.split('@')[0] || 'Counsel';

  return (
    <div className="space-y-5 lg:space-y-7">
      <div className="overflow-hidden rounded-3xl border border-slate-200/90 bg-lk-surface shadow-lk-card-lg ring-1 ring-slate-100/90">
        <div className="grid lg:grid-cols-[1.15fr_0.85fr] lg:items-stretch">
          <div className="relative overflow-hidden bg-gradient-to-br from-lk-navy via-[#0f172a] to-[#1e3a8f] px-5 py-6 text-white sm:px-7 sm:py-8">
            <div className="pointer-events-none absolute -right-16 top-0 h-48 w-48 rounded-full bg-lk-accent/20 blur-3xl" />
            <div className="pointer-events-none absolute bottom-0 left-0 h-32 w-32 rounded-full bg-emerald-400/10 blur-2xl" />
            <div className="relative">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white/90 backdrop-blur-sm">
                <FiShield className="text-emerald-300" aria-hidden />
                Lawyer portal
              </div>
              <h2 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl lg:text-[1.85rem] lg:leading-tight">
                Welcome back, {profileName}
              </h2>
              <p className="mt-3 max-w-lg text-sm leading-relaxed text-white/75 sm:text-[15px]">
                Confirmations, escrow payouts, and client messaging — one workspace for your practice on LawyersKonnect.
              </p>
              <div className="mt-6 flex flex-wrap gap-2.5">
                <Link to="/lawyer/appointments">
                  <Button
                    size="md"
                    leftIcon={<FiCalendar />}
                    className="shadow-lg shadow-black/20 motion-safe:transition-shadow motion-safe:hover:shadow-xl"
                  >
                    Appointments
                  </Button>
                </Link>
                <Link to="/lawyer/messages">
                  <Button
                    variant="outline"
                    size="md"
                    className="border-white/40 bg-white/15 !text-white hover:border-white/60 hover:bg-white/25 hover:!text-white"
                  >
                    Messages
                  </Button>
                </Link>
                <Link to="/lawyer/earnings">
                  <Button
                    variant="outline"
                    size="md"
                    className="border-white/40 bg-white/15 !text-white hover:border-white/60 hover:bg-white/25 hover:!text-white"
                  >
                    Earnings
                  </Button>
                </Link>
              </div>
            </div>
          </div>

          <div className="flex flex-col justify-between border-t border-slate-200/80 bg-gradient-to-b from-slate-50/90 to-white p-5 sm:p-6 lg:border-l lg:border-t-0 lg:border-slate-200/80">
            <div>
                            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-lk-muted">Your overview</p>
              <div className="mt-3 grid grid-cols-2 gap-2.5">
                <LawyerHeroStatCard icon={<FiClock className="text-lg text-lk-warning" />} label="Pending" value={pendingConfirmations} hint="Need confirm" />
                <LawyerHeroStatCard icon={<FiCalendar className="text-lg text-lk-accent" />} label="Total" value={stats?.total ?? 0} hint="Appointments" />
                <LawyerHeroStatCard icon={<FiCheck className="text-lg text-lk-success" />} label="Completed" value={stats?.completed ?? 0} hint="Done" />
                <LawyerHeroStatCard icon={<FiStar className="text-lg text-amber-500" />} label="Rating" value={Number(lawyerProfile?.averageRating?.toFixed(1) || 0)} hint={`${lawyerProfile?.totalReviews || 0} reviews`} />
              </div>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-200/70 pt-4">
              {lawyerProfile?.verificationStatus === 'verified' && <StatusLabel status="verified" />}
              {lawyerProfile?.verificationStatus === 'pending' && <StatusLabel status="pending" />}
              {lawyerProfile?.verificationStatus &&
                !['verified', 'pending'].includes(String(lawyerProfile.verificationStatus)) && (
                  <StatusLabel status={String(lawyerProfile.verificationStatus)} />
                )}
            </div>
          </div>
        </div>
      </div>

      {shouldShowCompleteProfileBanner && (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <h3 className="font-semibold text-amber-950">Complete your profile</h3>
            <p className="text-sm leading-relaxed text-amber-900/90">Add fee, bio, and practice areas so clients can book with confidence.</p>
          </div>
          <Link to="/lawyer/profile">
            <Button size="sm">Complete Profile</Button>
          </Link>
        </div>
      )}

      {shouldShowKycIncompleteBanner && (
        <div className="flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <h3 className="font-semibold text-rose-800">Verification Incomplete</h3>
            <p className="text-sm text-rose-700">
              KYC verification required. Please complete profile details and submit CNIC + Bar Council documents.
            </p>
          </div>
          <div className="flex gap-2">
            <Link to="/lawyer/profile">
              <Button size="sm" variant="outline">Complete Profile</Button>
            </Link>
            <Link to="/lawyer/profile?tab=kyc">
              <Button size="sm">Start KYC Verification</Button>
            </Link>
          </div>
        </div>
      )}

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Upcoming Appointments */}
        <div className="lg:col-span-2">
          <Card className="shadow-lk-card-md">
            <CardHeader
              title="Upcoming appointments"
              action={
                <Link to="/lawyer/appointments" className="text-sm font-semibold text-lk-accent hover:underline">
                  View all
                </Link>
              }
            />
            
            {upcomingAppointments.length === 0 ? (
              <div className="rounded-xl border border-dashed border-lk-border py-10 text-center text-lk-muted">
                <FiCalendar className="mx-auto mb-2 text-4xl text-lk-border" />
                <p className="text-sm font-medium text-lk-navy">No upcoming appointments</p>
              </div>
            ) : (
              <div className="space-y-4">
                {upcomingAppointments.map((appointment) => (
                  <div
                    key={appointment._id}
                    className="flex items-center gap-4 rounded-xl border border-lk-border bg-lk-canvas/50 p-4"
                  >
                    <Avatar
                      name={(appointment.citizenId as any)?.citizenProfile?.fullName || 'Client'}
                      size="lg"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-lk-navy">
                        {(appointment.citizenId as any)?.citizenProfile?.fullName || 'Client'}
                      </div>
                      <div className="text-sm text-lk-muted">
                        {new Date(appointment.appointmentDate).toLocaleDateString()} · {appointment.startTime}
                      </div>
                      <div className="text-sm text-lk-muted">{appointment.caseCategory || 'General consultation'}</div>
                    </div>
                    <div className="flex flex-col items-start sm:items-end gap-2">
                      <StatusLabel status={appointment.status} />
                      {appointment.status === 'pending' && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleConfirmAppointment(appointment._id)}
                          >
                            Confirm
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Quick Stats */}
        <div className="space-y-6">
          <LawyerSubscriptionSummaryCard summary={subscriptionSummary} />

          {/* Consultation Fee */}
          <Card className="shadow-lk-card-md">
            <CardHeader title="Consultation fee" />
            <div className="text-3xl font-bold tabular-nums text-lk-navy">PKR {lawyerProfile?.consultationFee?.toLocaleString() || 0}</div>
            <p className="mt-1 text-sm text-lk-muted">Per session ({lawyerProfile?.consultationDuration || 30} mins)</p>
            <Link to="/lawyer/profile" className="mt-3 inline-block text-sm font-semibold text-lk-accent hover:underline">
              Update fee
            </Link>
          </Card>

          <Card className="shadow-lk-card-md">
            <CardHeader title="Quick actions" />
            <div className="space-y-2">
              <Link to="/lawyer/appointments" className="block">
                <Button className="w-full justify-start bg-gradient-to-r from-lk-accent to-[#1e3a8f]" leftIcon={<FiCalendar />}>
                  Manage Appointments
                </Button>
              </Link>
              <Link to="/lawyer/messages" className="block">
                <Button variant="secondary" className="w-full justify-start !bg-lk-navy !text-white hover:!bg-[#1e3a8f]" leftIcon={<FiMessageSquare />}>
                  View Messages
                </Button>
              </Link>
              <Link to="/lawyer/earnings" className="block">
                <Button variant="outline" className="w-full justify-start border-lk-accent/40 text-lk-accent hover:bg-blue-50" leftIcon={<FiCreditCard />}>
                  Earnings &amp; payouts
                </Button>
              </Link>
            </div>
          </Card>

          <Card className="shadow-lk-card-md">
            <CardHeader title="Practice areas" />
            <div className="flex flex-wrap gap-2">
              {lawyerProfile?.practiceAreas?.length ? (
                lawyerProfile.practiceAreas.map((area) => (
                  <Badge key={area} variant="secondary">{area}</Badge>
                ))
              ) : (
                <p className="text-sm text-lk-muted">No practice areas set</p>
              )}
            </div>
            <Link to="/lawyer/profile" className="mt-3 inline-block text-sm font-semibold text-lk-accent hover:underline">
              Edit profile
            </Link>
          </Card>
        </div>
      </div>
    </div>
  );
}

function LawyerSubscriptionSummaryCard({ summary }: { summary: any }) {
  const tier = normalizePlanSlug(summary?.effectivePlanCode || summary?.subscriptionTier);
  const limits = resolveLimitsFromUsage(tier, summary?.usage);
  const usage = summary?.usage;
  const isActivePaid =
    (tier === 'professional' || tier === 'premium') &&
    (summary?.remainingDays == null || (summary?.remainingDays ?? 0) > 0);
  const displayStatus = resolvePlanDisplayStatus({
    effectiveCode: tier,
    isActivePaid,
    subscriptionStatus: summary?.subscription?.status,
    subscriptionTier: summary?.subscriptionTier,
  });
  const planName = summary?.effectivePlan?.name || LAWYER_PLAN_PRICES[tier].name;
  const expiry = summary?.subscriptionExpiresAt
    ? new Date(summary.subscriptionExpiresAt).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;

  let body = `Free plan — ${limits.appointmentsPerMonth} appointment requests per month.`;
  if (displayStatus === 'active' && expiry) {
    body =
      tier === 'premium'
        ? `Premium until ${expiry} — ${limits.appointmentsPerMonth} appointments / month.`
        : `Professional until ${expiry} — ${limits.appointmentsPerMonth} appointments / month.`;
  } else if (displayStatus === 'expired') {
    body = 'Your paid plan expired. Renew to restore higher limits.';
  } else if (displayStatus === 'pending') {
    body = 'Complete payment to activate your selected plan.';
  }

  const apptUsed = usage?.usage?.appointments ?? 0;

  return (
    <Card className="overflow-hidden border border-slate-200/90 shadow-lk-card-md ring-1 ring-slate-100/80">
      <div className="bg-gradient-to-r from-lk-navy/95 to-[#1e3a8f]/90 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/70">Subscription</p>
          <Badge variant="success" className="bg-white/15 text-[10px] text-white ring-1 ring-white/20">
            {PLAN_STATUS_LABELS[displayStatus]}
          </Badge>
        </div>
        <p className="mt-1 text-lg font-bold text-white">{planName}</p>
      </div>
      <div className="space-y-3 p-4">
        <p className="text-sm leading-relaxed text-lk-muted">{body}</p>
        <div className="flex flex-wrap gap-2 text-[11px] font-medium text-lk-navy">
          <span className="rounded-lg bg-slate-100 px-2.5 py-1">
            Appointments {apptUsed}/{limits.appointmentsPerMonth}
          </span>
        </div>
        <Link to="/lawyer/subscription" className="block">
          <Button size="sm" className="w-full" variant={tier === 'free' ? 'primary' : 'outline'}>
            Manage subscription
          </Button>
        </Link>
      </div>
    </Card>
  );
}

function LawyerHeroStatCard({
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
    <div className="rounded-xl border border-slate-200/90 bg-white/95 p-3 shadow-sm ring-1 ring-slate-100/80">
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
