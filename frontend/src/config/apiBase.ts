/**
 * API base URL for browser requests.
 * Production builds must set VITE_API_BASE_URL; development defaults to local backend.
 */
export function getApiBaseUrl(): string {
  const fromEnv = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, '');
  }
  if (import.meta.env.DEV) {
    return 'http://localhost:3000';
  }
  throw new Error(
    'VITE_API_BASE_URL is required in production. Set it in the environment for `vite build` (e.g. Vercel project env).',
  );
}
