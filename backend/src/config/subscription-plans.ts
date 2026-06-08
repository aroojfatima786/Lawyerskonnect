export type SubscriptionPlanCode = 'free' | 'professional' | 'premium';
export type SubscriptionBillingCycle = 'monthly' | 'yearly';

export interface SubscriptionPlanLimits {
  appointmentsPerMonth: number;
}

export interface SubscriptionPlanDefinition {
  slug: SubscriptionPlanCode;
  name: string;
  monthlyPrice: number;
  yearlyPrice: number;
  priorityRank: number;
  isFeatured: boolean;
  isActive: boolean;
  limitsByCycle: Record<SubscriptionBillingCycle, SubscriptionPlanLimits>;
}

/** Monthly vs yearly caps — yearly subscription = higher monthly allowance. */
export const SUBSCRIPTION_PLAN_LIMITS: Record<
  SubscriptionPlanCode,
  Record<SubscriptionBillingCycle, SubscriptionPlanLimits>
> = {
  free: {
    monthly: { appointmentsPerMonth: 3 },
    yearly: { appointmentsPerMonth: 3 },
  },
  professional: {
    monthly: { appointmentsPerMonth: 5 },
    yearly: { appointmentsPerMonth: 70 },
  },
  premium: {
    monthly: { appointmentsPerMonth: 10 },
    yearly: { appointmentsPerMonth: 100 },
  },
};

export function buildPlanFeatures(
  code: SubscriptionPlanCode,
  billingCycle: SubscriptionBillingCycle,
): string[] {
  const limits = getPlanLimits(code, billingCycle);
  const base = [`${limits.appointmentsPerMonth} appointment requests / month`];
  if (code === 'free') {
    return [...base, 'Basic dashboard', 'Standard support'];
  }
  if (code === 'professional') {
    return [...base, 'Enhanced dashboard', 'Priority support'];
  }
  return [...base, 'Advanced analytics', 'Priority support'];
}

export const SUBSCRIPTION_PLANS: Record<SubscriptionPlanCode, SubscriptionPlanDefinition> = {
  free: {
    slug: 'free',
    name: 'Free',
    monthlyPrice: 0,
    yearlyPrice: 0,
    priorityRank: 100,
    isFeatured: false,
    isActive: true,
    limitsByCycle: SUBSCRIPTION_PLAN_LIMITS.free,
  },
  professional: {
    slug: 'professional',
    name: 'Professional',
    monthlyPrice: 5000,
    yearlyPrice: 30000,
    priorityRank: 200,
    isFeatured: false,
    isActive: true,
    limitsByCycle: SUBSCRIPTION_PLAN_LIMITS.professional,
  },
  premium: {
    slug: 'premium',
    name: 'Premium',
    monthlyPrice: 10000,
    yearlyPrice: 50000,
    priorityRank: 300,
    isFeatured: true,
    isActive: true,
    limitsByCycle: SUBSCRIPTION_PLAN_LIMITS.premium,
  },
};

export function getSubscriptionPlan(code: string): SubscriptionPlanDefinition | null {
  const key = code?.toLowerCase() as SubscriptionPlanCode;
  const plan = SUBSCRIPTION_PLANS[key];
  if (!plan || !plan.isActive) return null;
  return plan;
}

export function getPlanPrice(
  code: SubscriptionPlanCode,
  billingCycle: SubscriptionBillingCycle,
): number {
  const plan = SUBSCRIPTION_PLANS[code];
  if (!plan) return 0;
  return billingCycle === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice;
}

export function getPlanLimits(
  code: string,
  billingCycle: SubscriptionBillingCycle = 'monthly',
): SubscriptionPlanLimits {
  const key = (code?.toLowerCase() || 'free') as SubscriptionPlanCode;
  const row = SUBSCRIPTION_PLAN_LIMITS[key] || SUBSCRIPTION_PLAN_LIMITS.free;
  return row[billingCycle] || row.monthly;
}

export function getActivePlansForCatalog(billingCycle: SubscriptionBillingCycle = 'monthly') {
  return Object.values(SUBSCRIPTION_PLANS)
    .filter((p) => p.isActive)
    .map((p) => ({
      ...p,
      features: buildPlanFeatures(p.slug, billingCycle),
      limits: getPlanLimits(p.slug, billingCycle),
      limitsByCycle: p.limitsByCycle,
    }));
}
