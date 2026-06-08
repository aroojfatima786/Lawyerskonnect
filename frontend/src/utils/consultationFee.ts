/** Matches backend PLATFORM_FEE_PERCENT default (additive on top of consultation fee). */
const DEFAULT_PLATFORM_FEE_PERCENT = 10;

export type ConsultationFeeBreakdown = {
  consultationFee: number;
  platformFee: number;
  platformFeePercent: number;
  totalPayable: number;
};

export function computeConsultationFeeBreakdown(
  consultationFee: number,
  platformFeePercent = DEFAULT_PLATFORM_FEE_PERCENT,
): ConsultationFeeBreakdown {
  const base = Math.max(0, Number(consultationFee || 0));
  const platformFee = Math.round((base * platformFeePercent) / 100);
  return {
    consultationFee: base,
    platformFee,
    platformFeePercent,
    totalPayable: base + platformFee,
  };
}
