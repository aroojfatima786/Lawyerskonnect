export type LawyerPlanSlug = 'free' | 'professional' | 'premium';

export type BillingCycle = 'monthly' | 'yearly';



export type PlanLimits = {

  appointmentsPerMonth: number;

};



export const LAWYER_PLAN_LIMITS: Record<

  LawyerPlanSlug,

  Record<BillingCycle, PlanLimits>

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



export function getPlanLimits(

  slug: LawyerPlanSlug,

  billingCycle: BillingCycle = 'monthly',

): PlanLimits {

  return LAWYER_PLAN_LIMITS[slug][billingCycle];

}



export function buildPlanFeatures(slug: LawyerPlanSlug, billingCycle: BillingCycle): string[] {

  const limits = getPlanLimits(slug, billingCycle);

  const base = [`${limits.appointmentsPerMonth} appointment requests / month`];

  if (slug === 'free') {

    return [...base, 'Basic dashboard', 'Standard support'];

  }

  if (slug === 'professional') {

    return [...base, 'Enhanced dashboard', 'Priority support'];

  }

  return [...base, 'Advanced analytics', 'Priority support'];

}



export const LAWYER_PLAN_DESCRIPTIONS: Record<LawyerPlanSlug, string> = {

  free: 'Essential tools to get started on the platform.',

  professional: 'Monthly: 5 appointments/mo (Rs. 5,000). Yearly: 70/mo (Rs. 30,000/year).',

  premium: 'Monthly: 10 appointments/mo (Rs. 10,000). Yearly: 100/mo (Rs. 50,000/year).',

};



export const LAWYER_PLAN_PRICES: Record<

  LawyerPlanSlug,

  { name: string; monthlyPrice: number; yearlyPrice: number; isFeatured: boolean }

> = {

  free: { name: 'Free', monthlyPrice: 0, yearlyPrice: 0, isFeatured: false },

  professional: { name: 'Professional', monthlyPrice: 5000, yearlyPrice: 30000, isFeatured: false },

  premium: { name: 'Premium', monthlyPrice: 10000, yearlyPrice: 50000, isFeatured: true },

};



/** @deprecated use buildPlanFeatures(slug, cycle) */

export const LAWYER_PLAN_FEATURES: Record<LawyerPlanSlug, string[]> = {

  free: buildPlanFeatures('free', 'monthly'),

  professional: buildPlanFeatures('professional', 'monthly'),

  premium: buildPlanFeatures('premium', 'monthly'),

};



export function normalizePlanSlug(code?: string | null): LawyerPlanSlug {

  const c = String(code || 'free').toLowerCase();

  if (c === 'professional' || c === 'premium') return c;

  return 'free';

}



export type PlanUsageSummary = {

  planCode?: string;

  billingCycle?: BillingCycle;

  monthLabel?: string;

  limits?: {

    appointmentsPerMonth?: number;

  };

  usage?: {

    appointments?: number;

  };

  remaining?: {

    appointments?: number;

  };

};



export function resolveLimitsFromUsage(

  slug: LawyerPlanSlug,

  usage?: PlanUsageSummary | null,

): PlanLimits {

  const cycle = usage?.billingCycle === 'yearly' ? 'yearly' : 'monthly';

  const fallback = getPlanLimits(slug, cycle);

  return {

    appointmentsPerMonth: usage?.limits?.appointmentsPerMonth ?? fallback.appointmentsPerMonth,

  };

}



export type PlanDisplayStatus = 'active' | 'free' | 'expired' | 'pending';



export function resolvePlanDisplayStatus(input: {

  effectiveCode: string;

  isActivePaid: boolean;

  subscriptionStatus?: string | null;

  subscriptionTier?: string | null;

}): PlanDisplayStatus {

  const subStatus = String(input.subscriptionStatus || '').toLowerCase();

  if (subStatus.includes('pending')) return 'pending';

  if (input.isActivePaid) return 'active';

  const tier = String(input.subscriptionTier || input.effectiveCode || 'free').toLowerCase();

  if ((tier === 'professional' || tier === 'premium') && !input.isActivePaid) return 'expired';

  return 'free';

}



export const PLAN_STATUS_LABELS: Record<PlanDisplayStatus, string> = {

  active: 'Active',

  free: 'Free',

  expired: 'Expired',

  pending: 'Pending payment',

};

