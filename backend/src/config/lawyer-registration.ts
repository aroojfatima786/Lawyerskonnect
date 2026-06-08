/** One-time lawyer platform registration fee (PKR). Override via LAWYER_REGISTRATION_FEE. */
export function getLawyerRegistrationFeePkr(): number {
  const raw = Number(process.env.LAWYER_REGISTRATION_FEE || 2000);
  if (!Number.isFinite(raw) || raw < 0) return 2000;
  return Math.round(raw);
}
