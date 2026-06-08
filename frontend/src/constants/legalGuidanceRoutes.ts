/** Public entry — redirects to citizen login or dashboard guidance */
export const PUBLIC_LEGAL_GUIDANCE_PATH = '/legal-guidance';

export const CITIZEN_LEGAL_GUIDANCE_PATH = '/client/legal-guidance';

export const CITIZEN_LOGIN_FOR_GUIDANCE = {
  pathname: '/auth/citizen/login',
  state: { from: CITIZEN_LEGAL_GUIDANCE_PATH },
} as const;
