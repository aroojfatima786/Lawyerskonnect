import * as crypto from 'crypto';

/**
 * JazzCash HMAC/integrity helpers.
 *
 * Official Jazz Cash merchant documentation defines:
 * - which fields are included in the request hash
 * - field order (often alphabetical, but confirm with your integration PDF)
 * - which algorithm (commonly HMAC-SHA256 with the integrity salt)
 *
 * The helpers below use one canonical process for BOTH merchant-form signing and
 * callback verification, so you can swap in the exact field list/order from your
 * merchant pack without touching business logic in PaymentService.
 *
 * TODO(merchant integration): Verify field inclusion + ordering against JazzCash sandbox docs
 * and replace {@link JAZZCALLBACK_HASH_INCLUDE_KEYS} if the gateway returns a fixed subset only.
 */

/** Keys never included in hash material (and never logged in plaintext). */
export const JAZZCASH_HASH_EXCLUDE_KEYS = new Set(['pp_SecureHash', 'pp_SecureHash2']);

/**
 * Produces a stable string: salt + "&" + sorted key=value pairs.
 * Excludes empty values and {@link JAZZCALLBACK_HASH_EXCLUDE_KEYS}.
 */
export function buildCanonicalDataString(
  integritySalt: string,
  fields: Record<string, string>,
  keyOrder: 'lexicographic' | string[] = 'lexicographic',
): string {
  let pairs: [string, string][];
  if (keyOrder === 'lexicographic') {
    pairs = Object.entries(fields)
      .filter(([k, v]) => !JAZZCASH_HASH_EXCLUDE_KEYS.has(k) && v != null && String(v).length > 0)
      .sort(([a], [b]) => a.localeCompare(b)) as [string, string][];
  } else {
    pairs = keyOrder
      .map((k) => [k, fields[k] ?? ''] as [string, string])
      .filter(([k, v]) => !JAZZCASH_HASH_EXCLUDE_KEYS.has(k) && v != null && String(v).length > 0);
  }
  const joined = pairs.map(([k, v]) => `${k}=${String(v)}`).join('&');
  return `${integritySalt}&${joined}`;
}

/**
 * Hash for merchant payment form submission (outbound).
 * Adjust this if your doc specifies a fixed key order (pass explicit array to buildCanonicalDataString).
 */
export function buildMerchantFormSecureHash(
  integritySalt: string,
  fields: Record<string, string>,
): string {
  const data = buildCanonicalDataString(integritySalt, fields, 'lexicographic');
  return crypto.createHmac('sha256', integritySalt).update(data).digest('hex');
}

/**
 * Verifies the callback/return `pp_SecureHash` using the same canonical rules as
 * {@link buildMerchantFormSecureHash}. If the gateway uses a different field set
 * for responses, set only those keys in `fields` (see TODO above).
 */
export function verifyJazzCashSecureHash(
  integritySalt: string,
  receivedFields: Record<string, string>,
  providedHash: string,
): boolean {
  if (!providedHash || !integritySalt) {
    return false;
  }
  const recomputed = buildMerchantFormSecureHash(integritySalt, receivedFields);
  const a = Buffer.from(recomputed, 'utf8');
  const b = Buffer.from(String(providedHash).trim(), 'utf8');
  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

/** Keys to include in callback hash if docs require a response-only subset. Empty = all non-empty (except hash). */
export const JAZZCALLBACK_HASH_INCLUDE_KEYS: string[] | null = null;

export function selectFieldsForCallbackHash(raw: Record<string, string>): Record<string, string> {
  if (!JAZZCALLBACK_HASH_INCLUDE_KEYS || JAZZCALLBACK_HASH_INCLUDE_KEYS.length === 0) {
    return { ...raw };
  }
  const out: Record<string, string> = {};
  for (const k of JAZZCALLBACK_HASH_INCLUDE_KEYS) {
    if (raw[k] != null && String(raw[k]).length > 0) {
      out[k] = String(raw[k]);
    }
  }
  return out;
}
