import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  FiAward,
  FiCheck,
  FiCreditCard,
  FiAlertCircle,
  FiZap,
  FiCalendar,
} from 'react-icons/fi';
import { subscriptionApi, paymentApi } from '../../services/api';
import { Button, Card, CardHeader, Badge } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../context/AuthContext';
import {
  LAWYER_PLAN_DESCRIPTIONS,
  LAWYER_PLAN_PRICES,
  buildPlanFeatures,
  normalizePlanSlug,
  resolveLimitsFromUsage,
  type PlanUsageSummary,
  resolvePlanDisplayStatus,
  PLAN_STATUS_LABELS,
  type LawyerPlanSlug,
} from '../../constants/lawyerSubscriptionPlans';
import { WALLET_PAYMENT_METHODS } from '../../constants/paymentMethods';
import { isStripeEnabled } from '../../config/stripe';

type BillingCycle = 'monthly' | 'yearly';
type PaidPlanCode = 'professional' | 'premium';

type PlanDef = {
  slug: LawyerPlanSlug;
  name: string;
  monthlyPrice: number;
  yearlyPrice: number;
  features: string[];
  description: string;
  isFeatured: boolean;
};

type SubscriptionState = {
  effectivePlanCode?: string;
  subscriptionTier?: string;
  subscriptionBadge?: string | null;
  subscriptionExpiresAt?: string | null;
  remainingDays?: number | null;
  autoRenew?: boolean;
  cancelAtPeriodEnd?: boolean;
  subscription?: {
    status?: string;
    planCode?: string;
    billingCycle?: string;
    currentPeriodEnd?: string;
  } | null;
  effectivePlan?: { name?: string; slug?: string };
  usage?: PlanUsageSummary;
};

function formatPkr(n: number) {
  return `Rs. ${Number(n || 0).toLocaleString('en-PK')}`;
}

function planIcon(slug: LawyerPlanSlug) {
  if (slug === 'premium') return <FiZap className="text-amber-500" />;
  if (slug === 'professional') return <FiAward className="text-blue-600" />;
  return <FiCheck className="text-slate-500" />;
}

function friendlyError(err: unknown): string {
  const e = err as { message?: string };
  return e?.message || 'Something went wrong. Please try again.';
}

function defaultPlans(cycle: BillingCycle): PlanDef[] {
  return (['free', 'professional', 'premium'] as LawyerPlanSlug[]).map((slug) => ({
    slug,
    name: LAWYER_PLAN_PRICES[slug].name,
    monthlyPrice: LAWYER_PLAN_PRICES[slug].monthlyPrice,
    yearlyPrice: LAWYER_PLAN_PRICES[slug].yearlyPrice,
    features: buildPlanFeatures(slug, cycle),
    description: LAWYER_PLAN_DESCRIPTIONS[slug],
    isFeatured: LAWYER_PLAN_PRICES[slug].isFeatured,
  }));
}

function mergePlansFromApi(apiPlans: any[], cycle: BillingCycle): PlanDef[] {
  if (!apiPlans?.length) return defaultPlans(cycle);
  return apiPlans.map((p) => {
    const slug = normalizePlanSlug(p.slug || p.code);
    return {
      slug,
      name: p.name || LAWYER_PLAN_PRICES[slug].name,
      monthlyPrice: p.monthlyPrice ?? LAWYER_PLAN_PRICES[slug].monthlyPrice,
      yearlyPrice: p.yearlyPrice ?? LAWYER_PLAN_PRICES[slug].yearlyPrice,
      features: p.features?.length ? p.features : buildPlanFeatures(slug, cycle),
      description: LAWYER_PLAN_DESCRIPTIONS[slug],
      isFeatured: p.isFeatured ?? LAWYER_PLAN_PRICES[slug].isFeatured,
    };
  });
}

function planButtonLabel(
  planSlug: LawyerPlanSlug,
  effectiveCode: LawyerPlanSlug,
  isActivePaid: boolean,
  displayStatus: ReturnType<typeof resolvePlanDisplayStatus>,
): string {
  const isCurrent = effectiveCode === planSlug && (planSlug === 'free' || isActivePaid);
  if (isCurrent) return 'Current plan';
  if (planSlug === 'free') return 'Included';
  if (displayStatus === 'expired') return 'Renew';
  if (effectiveCode === 'free') return 'Upgrade';
  if (isActivePaid) return 'Switch plan';
  return 'Select plan';
}

export default function LawyerSubscription() {
  const toast = useToast();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<PlanDef[]>(defaultPlans('monthly'));
  const [subState, setSubState] = useState<SubscriptionState | null>(null);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');
  const [selectedMethod, setSelectedMethod] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [checkoutUi, setCheckoutUi] = useState<any>(null);

  const [processing, setProcessing] = useState(false);
  const [paymentInitiated, setPaymentInitiated] = useState(false);
  const [pendingPlan, setPendingPlan] = useState<PaidPlanCode | null>(null);
  const [paymentId, setPaymentId] = useState('');
  const [providerName, setProviderName] = useState('');
  const [gatewayInfo, setGatewayInfo] = useState<any>(null);
  const [referenceNumber, setReferenceNumber] = useState('');
  const [redirectFormPayload, setRedirectFormPayload] = useState<any>(null);
  const [checkoutUrl, setCheckoutUrl] = useState('');

  const [returnAlert, setReturnAlert] = useState<{
    type: 'success' | 'failed' | 'pending' | 'error' | 'cancelled';
    message: string;
  } | null>(null);
  const stripeCheckoutEnabled = isStripeEnabled();

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [plansRes, subRes] = await Promise.all([
        subscriptionApi.getPlans(billingCycle),
        subscriptionApi.getMySubscription(),
      ]);
      setPlans(mergePlansFromApi((plansRes as any)?.data || [], billingCycle));
      setSubState((subRes as any)?.data || null);
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }, [toast, billingCycle]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    setPlans((prev) =>
      prev.map((p) => ({
        ...p,
        features: buildPlanFeatures(p.slug, billingCycle),
      })),
    );
  }, [billingCycle]);

  useEffect(() => {
    const stripeResult = searchParams.get('stripe');
    if (stripeResult === 'success') {
      toast.success('Subscription payment received. Your plan will update shortly.');
      void loadData();
      setSearchParams({}, { replace: true });
    } else if (stripeResult === 'cancel') {
      toast.info('Subscription checkout was cancelled. You can try again.');
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams, toast, loadData]);

  useEffect(() => {
    paymentApi
      .getCitizenCheckoutContext()
      .then((r: any) => setCheckoutUi(r?.data || null))
      .catch(() => setCheckoutUi(null));
  }, []);

  useEffect(() => {
    const paymentResult = searchParams.get('paymentResult');
    if (!paymentResult) return;

    const paymentIdParam = searchParams.get('paymentId') || '';
    let type: 'success' | 'failed' | 'pending' | 'error' | 'cancelled' = 'pending';
    let message = 'Payment is being processed.';

    if (paymentResult === 'success' || paymentResult === 'completed') {
      type = 'success';
      message = 'Subscription payment received. Your plan will update shortly.';
    } else if (paymentResult === 'failed') {
      type = 'failed';
      message = 'Payment failed. You can try again or use another method.';
    } else if (paymentResult === 'error') {
      type = 'error';
      message = searchParams.get('message') || 'Payment could not be verified.';
    } else if (paymentResult === 'cancelled') {
      type = 'cancelled';
      message = 'Payment was cancelled.';
    }

    setReturnAlert({ type, message });
    if (paymentIdParam) setPaymentId(paymentIdParam);

    const next = new URLSearchParams(searchParams);
    next.delete('paymentResult');
    next.delete('paymentId');
    next.delete('idempotent');
    next.delete('code');
    next.delete('message');
    setSearchParams(next, { replace: true });

    void loadData();
  }, [searchParams, setSearchParams, loadData]);

  const effectiveCode = normalizePlanSlug(subState?.effectivePlanCode || subState?.subscriptionTier);
  const isActivePaid =
    (effectiveCode === 'professional' || effectiveCode === 'premium') &&
    (subState?.remainingDays == null || (subState.remainingDays ?? 0) > 0);

  const displayStatus = resolvePlanDisplayStatus({
    effectiveCode,
    isActivePaid,
    subscriptionStatus: subState?.subscription?.status,
    subscriptionTier: subState?.subscriptionTier,
  });

  const limits = resolveLimitsFromUsage(effectiveCode, subState?.usage);
  const usage = subState?.usage;
  const profile = user?.lawyerProfile;
  const isLawyerVerified = String(profile?.verificationStatus || '').toLowerCase() === 'verified';
  const appointmentsUsed = usage?.usage?.appointments ?? 0;

  const visibleMethods = useMemo(() => {
    if (checkoutUi?.checkoutBlocked) return [];
    return [...WALLET_PAYMENT_METHODS];
  }, [checkoutUi?.checkoutBlocked]);

  const resetCheckout = () => {
    setPaymentInitiated(false);
    setPendingPlan(null);
    setPaymentId('');
    setGatewayInfo(null);
    setReferenceNumber('');
    setRedirectFormPayload(null);
    setCheckoutUrl('');
    setProviderName('');
  };

  const submitGatewayForm = () => {
    if (!redirectFormPayload?.action || !redirectFormPayload?.fields) return;
    const form = document.createElement('form');
    form.method = redirectFormPayload?.method || 'POST';
    form.action = redirectFormPayload.action;
    form.style.display = 'none';
    Object.entries(redirectFormPayload.fields).forEach(([key, value]) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = key;
      input.value = String(value ?? '');
      form.appendChild(input);
    });
    document.body.appendChild(form);
    form.submit();
    document.body.removeChild(form);
  };

  const handleSelectPlan = async (slug: string) => {
    if (slug === 'free') {
      toast.info('You are on the Free plan by default. Choose Professional or Premium below to upgrade.');
      return;
    }
    if (!isLawyerVerified) {
      toast.error('Your lawyer account must be verified before subscribing to a paid plan.');
      return;
    }
    if (!selectedMethod) {
      toast.error('Select a payment method first');
      return;
    }
    if (
      !stripeCheckoutEnabled &&
      ['jazzcash', 'easypaisa'].includes(selectedMethod) &&
      !phoneNumber.trim()
    ) {
      toast.error('Enter your mobile number for wallet payment');
      return;
    }
    if (!user?._id) {
      toast.error('Please sign in again to continue.');
      return;
    }

    setProcessing(true);
    resetCheckout();
    try {
      const res: any = await subscriptionApi.checkoutSubscription({
        planCode: slug as PaidPlanCode,
        billingCycle,
        method: selectedMethod,
        accountIdentifier: phoneNumber.trim() || undefined,
        stripeCheckout: stripeCheckoutEnabled,
      });
      const d = res?.data || {};

      if (stripeCheckoutEnabled) {
        const stripeRes: any = await paymentApi.createStripeSession({
          amount: Number(d.amount || 0),
          currency: 'PKR',
          orderId: String(d.paymentId || ''),
          userId: String(user._id),
          walletMethod: selectedMethod as 'jazzcash' | 'easypaisa',
          checkoutType: 'subscription',
        });
        const sessionUrl = stripeRes?.data?.sessionUrl || stripeRes?.sessionUrl;
        if (!sessionUrl) {
          throw new Error('Checkout session URL was not returned');
        }
        window.location.href = sessionUrl;
        return;
      }

      setPendingPlan(slug as PaidPlanCode);
      setPaymentId(d.paymentId || '');
      setProviderName(d.provider || '');
      setGatewayInfo(d.gatewayInfo);
      setReferenceNumber(d.referenceNumber || '');
      setRedirectFormPayload(d.redirectFormPayload || null);
      setCheckoutUrl(d.checkoutUrl || '');
      setPaymentInitiated(true);
      toast.success('Checkout started. Complete payment using the instructions below.');
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setProcessing(false);
    }
  };

  const handleConfirmManual = async () => {
    if (!paymentId) return;
    setProcessing(true);
    try {
      await subscriptionApi.confirmSubscriptionPayment(paymentId);
      toast.success('Subscription payment confirmed.');
      resetCheckout();
      await loadData();
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setProcessing(false);
    }
  };

  const handleCancel = async () => {
    setProcessing(true);
    try {
      await subscriptionApi.cancelSubscription();
      toast.success('Subscription will end at the close of your billing period.');
      await loadData();
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setProcessing(false);
    }
  };

  const isManualProvider =
    providerName === 'manual' || (!providerName && !checkoutUrl && !redirectFormPayload);

  const expiryLabel = subState?.subscriptionExpiresAt
    ? new Date(subState.subscriptionExpiresAt).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-24 animate-pulse rounded-2xl bg-slate-200/80" />
        <div className="h-36 animate-pulse rounded-2xl bg-slate-200/80" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-200/70" />
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-72 animate-pulse rounded-2xl bg-slate-200/70" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-5 pb-8">
      {!isLawyerVerified && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950 sm:px-5">
          <p className="font-semibold text-amber-900">Verification required for paid plans</p>
          <p className="mt-1 leading-relaxed">
            Complete KYC review before subscribing. Upload your CNIC document and Bar Council license/certificate, then
            wait for admin approval.
          </p>
          <Link
            to="/lawyer/profile?tab=kyc"
            className="mt-3 inline-block text-sm font-semibold text-lk-accent hover:underline"
          >
            Go to KYC verification
          </Link>
        </div>
      )}

      {returnAlert && (
        <div
          role="alert"
          className={`rounded-2xl border px-4 py-4 sm:px-5 ${
            returnAlert.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : returnAlert.type === 'pending'
                ? 'border-amber-200 bg-amber-50 text-amber-950'
                : 'border-rose-200 bg-rose-50 text-rose-900'
          }`}
        >
          <div className="flex gap-3">
            <FiAlertCircle className="mt-0.5 shrink-0 text-lg" />
            <div>
              <p className="font-semibold capitalize">{returnAlert.type}</p>
              <p className="mt-1 text-sm opacity-90">{returnAlert.message}</p>
            </div>
          </div>
        </div>
      )}

      {/* Current plan — compact */}
      <Card className="overflow-hidden border border-slate-200/90 shadow-sm ring-1 ring-slate-100/90">
        <div className="flex flex-col gap-3 bg-gradient-to-r from-lk-navy via-[#12355B] to-[#1e3a8f] px-4 py-4 text-white sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/65">Current plan</p>
              <Badge variant="success" className="bg-white/15 px-2 py-0 text-[10px] text-white ring-1 ring-white/25">
                {PLAN_STATUS_LABELS[displayStatus]}
              </Badge>
              {isActivePaid && (
                <Badge variant="secondary" className="bg-white/10 px-2 py-0 text-[10px] capitalize text-white">
                  {effectiveCode}
                </Badge>
              )}
            </div>
            <h2 className="mt-1 font-serif text-xl font-bold capitalize sm:text-2xl">
              {subState?.effectivePlan?.name || LAWYER_PLAN_PRICES[effectiveCode].name}
            </h2>
            <p className="mt-0.5 text-xs text-white/75">
              {displayStatus === 'active' && expiryLabel
                ? `Active until ${expiryLabel}`
                : displayStatus === 'free'
                  ? 'Free plan — upgrade for higher limits.'
                  : displayStatus === 'expired'
                    ? 'Plan expired — renew to restore paid limits.'
                    : displayStatus === 'pending'
                      ? 'Payment pending — complete checkout to activate.'
                      : LAWYER_PLAN_DESCRIPTIONS[effectiveCode]}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {isActivePaid && !subState?.cancelAtPeriodEnd && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleCancel()}
                disabled={processing}
                className="border-white/30 bg-white/10 text-white hover:bg-white/20"
              >
                Cancel at period end
              </Button>
            )}
            {subState?.cancelAtPeriodEnd && <span className="text-xs text-white/70">Cancellation scheduled</span>}
          </div>
        </div>
        <div className="grid grid-cols-2 divide-x divide-slate-100 border-t border-slate-100 sm:grid-cols-4">
          <Stat label="Billing cycle" value={subState?.subscription?.billingCycle || '—'} />
          <Stat
            label="Days remaining"
            value={
              subState?.remainingDays != null
                ? String(subState.remainingDays)
                : isActivePaid
                  ? '—'
                  : '0'
            }
          />
          <Stat label="Expiry" value={expiryLabel || '—'} />
          <Stat label="Auto-renew" value={subState?.autoRenew ? 'On' : 'Off'} />
        </div>
        {effectiveCode === 'free' && displayStatus !== 'pending' && (
          <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-lk-muted">
            Select <strong>Professional</strong> or <strong>Premium</strong> below to upgrade.
          </p>
        )}
      </Card>

      {/* Usage overview */}
      <section className="space-y-2">
        <div>
          <h2 className="text-base font-semibold text-lk-navy">Usage overview</h2>
          <p className="text-xs text-lk-muted">Limits on your {LAWYER_PLAN_PRICES[effectiveCode].name} plan</p>
        </div>
        <UsageCard
          icon={<FiCalendar className="text-lk-accent" />}
          label="Appointments"
          usedLabel={String(appointmentsUsed)}
          limit={limits.appointmentsPerMonth}
          suffix="/ mo"
        />
        {usage?.monthLabel && (
          <p className="text-xs text-lk-muted">
            Usage resets each calendar month (PK time). Current: {usage.monthLabel}
            {usage.billingCycle ? ` · ${usage.billingCycle} plan` : ''}
          </p>
        )}
      </section>

      {/* Billing + payment method */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-lk-navy">Choose a plan</h2>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setBillingCycle('monthly')}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                billingCycle === 'monthly' ? 'bg-lk-navy text-white shadow' : 'text-lk-muted hover:text-lk-navy'
              }`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setBillingCycle('yearly')}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                billingCycle === 'yearly' ? 'bg-lk-navy text-white shadow' : 'text-lk-muted hover:text-lk-navy'
              }`}
            >
              Yearly
            </button>
          </div>

          {!paymentInitiated && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-lk-muted">Pay with:</span>
              {visibleMethods.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelectedMethod(m.id)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                    selectedMethod === m.id
                      ? 'border-[#1e3a8f] bg-[#1e3a8f]/10 text-lk-navy'
                      : 'border-slate-200 bg-white text-lk-muted hover:border-slate-300'
                  }`}
                >
                  {m.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {['jazzcash', 'easypaisa'].includes(selectedMethod) && !paymentInitiated && !stripeCheckoutEnabled && (
          <input
            type="tel"
            placeholder="Mobile number (03XXXXXXXXX)"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            className="w-full max-w-md rounded-xl border border-lk-border px-4 py-3 text-sm focus:border-lk-accent focus:outline-none focus:ring-2 focus:ring-lk-accent/20"
          />
        )}
      </section>

      {/* Plan cards */}
      <div className="grid gap-6 md:grid-cols-3">
        {plans.map((plan) => {
          const price = billingCycle === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice;
          const isCurrent = effectiveCode === plan.slug && (plan.slug === 'free' || isActivePaid);
          const isPaid = plan.slug === 'professional' || plan.slug === 'premium';
          const ctaLabel = planButtonLabel(plan.slug, effectiveCode, isActivePaid, displayStatus);
          const cardAccent =
            plan.slug === 'premium'
              ? 'border-amber-300/70 shadow-lg shadow-amber-100/40 ring-1 ring-amber-200/50'
              : plan.slug === 'professional'
                ? 'border-blue-200/80 shadow-lk-card-md ring-1 ring-blue-100/60'
                : 'border-slate-200/90 shadow-lk-card-md';

          return (
            <Card
              key={plan.slug}
              className={`relative flex flex-col border-2 transition duration-300 hover:-translate-y-0.5 ${cardAccent} ${
                isCurrent ? 'ring-2 ring-lk-accent/40' : ''
              }`}
            >
              {plan.isFeatured && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 px-3 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm">
                  Premium
                </span>
              )}
              <div className="flex flex-1 flex-col p-6">
                <div className="flex items-center gap-2">
                  {planIcon(plan.slug)}
                  <h3 className="text-lg font-bold text-lk-navy">{plan.name}</h3>
                </div>
                <p className="mt-2 text-sm text-lk-muted">{plan.description}</p>
                <p className="mt-4 text-2xl font-extrabold text-lk-navy">
                  {formatPkr(price)}
                  <span className="text-sm font-normal text-lk-muted">
                    /{billingCycle === 'yearly' ? 'year' : 'month'}
                  </span>
                </p>
                <ul className="mt-5 flex-1 space-y-2">
                  {plan.features.map((f) => (
                    <li key={f} className="flex gap-2 text-sm text-lk-muted">
                      <FiCheck className="mt-0.5 shrink-0 text-emerald-600" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="border-t border-slate-100 p-4">
                {isCurrent ? (
                  <Button className="w-full" variant="outline" disabled>
                    Current plan
                  </Button>
                ) : isPaid ? (
                  <Button
                    className="w-full"
                    variant={plan.slug === 'premium' ? 'primary' : 'primary'}
                    onClick={() => void handleSelectPlan(plan.slug)}
                    isLoading={processing && pendingPlan === plan.slug}
                    disabled={processing || !isLawyerVerified}
                  >
                    {ctaLabel}
                  </Button>
                ) : (
                  <Button className="w-full" variant="outline" disabled>
                    Included
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Checkout panel */}
      {paymentInitiated && (
        <Card className="border border-blue-200/80 bg-blue-50/30 shadow-lg">
          <CardHeader
            title={`Complete ${pendingPlan} subscription`}
            subtitle={referenceNumber ? `Reference: ${referenceNumber}` : undefined}
          />
          <div className="space-y-4 px-6 pb-6">
            {gatewayInfo?.instructions && (
              <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-lk-muted">
                <p className="font-semibold text-lk-navy">{gatewayInfo.gateway || 'Payment instructions'}</p>
                <p className="mt-2">{gatewayInfo.instructions}</p>
                {gatewayInfo.accountToSend && (
                  <p className="mt-2 font-mono text-lk-navy">From: {gatewayInfo.accountToSend}</p>
                )}
              </div>
            )}
            {gatewayInfo?.receivingWallet && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/90 p-4 text-xs text-amber-950">
                <p className="font-semibold">Send payment to LawyersKonnect wallet</p>
                {gatewayInfo.receivingWallet.accountTitle && (
                  <p className="mt-1">Title: {gatewayInfo.receivingWallet.accountTitle}</p>
                )}
                {gatewayInfo.receivingWallet.accountNumber && (
                  <p>Account: {gatewayInfo.receivingWallet.accountNumber}</p>
                )}
                {gatewayInfo.receivingWallet.jazzcashNumber && (
                  <p>JazzCash: {gatewayInfo.receivingWallet.jazzcashNumber}</p>
                )}
                {gatewayInfo.receivingWallet.easypaisaNumber && (
                  <p>EasyPaisa: {gatewayInfo.receivingWallet.easypaisaNumber}</p>
                )}
              </div>
            )}

            {redirectFormPayload?.action && (
              <Button className="w-full" onClick={submitGatewayForm} leftIcon={<FiCreditCard />}>
                Continue to {providerName === 'jazzcash' ? 'JazzCash' : 'EasyPaisa'} checkout
              </Button>
            )}

            {checkoutUrl && !redirectFormPayload?.action && (
              <a
                href={checkoutUrl}
                className="inline-flex w-full items-center justify-center rounded-xl bg-lk-accent px-4 py-3 text-sm font-semibold text-white"
              >
                Open payment page
              </a>
            )}

            {isManualProvider && paymentId && (
              <Button className="w-full" onClick={() => void handleConfirmManual()} isLoading={processing}>
                I've paid — confirm payment
              </Button>
            )}

            <Button variant="ghost" size="sm" onClick={resetCheckout}>
              Cancel checkout
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-2.5 sm:px-4">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-lk-muted">{label}</p>
      <p className="mt-0.5 text-sm font-bold capitalize text-lk-navy sm:text-base">{value}</p>
    </div>
  );
}

function UsageCard({
  icon,
  label,
  usedLabel,
  limit,
  suffix = '',
  isTextOnly = false,
}: {
  icon: ReactNode;
  label: string;
  usedLabel: string;
  limit: number | null;
  suffix?: string;
  isTextOnly?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-slate-200/90 bg-white px-3 py-2.5 shadow-sm">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50">{icon}</div>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-lk-muted">{label}</p>
          {isTextOnly ? (
            <p className="text-sm font-bold text-lk-navy">{usedLabel}</p>
          ) : (
            <p className="text-sm font-bold tabular-nums text-lk-navy">
              <span>{usedLabel}</span>
              <span className="text-lk-muted"> / </span>
              <span>{limit}</span>
              {suffix && <span className="text-xs font-medium text-lk-muted">{suffix}</span>}
            </p>
          )}
        </div>
    </div>
  );
}
