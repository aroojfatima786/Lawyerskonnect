/** Optional Stripe checkout toggle (Vite: VITE_STRIPE_ENABLED; CRA alias: REACT_APP_STRIPE_ENABLED). */
export function isStripeEnabled(): boolean {
  const vite = String(import.meta.env.VITE_STRIPE_ENABLED || '').trim().toLowerCase();
  const cra = String(import.meta.env.REACT_APP_STRIPE_ENABLED || '').trim().toLowerCase();
  return vite === 'true' || cra === 'true';
}
