import * as crypto from 'crypto';

/**
 * EasyPaisa (Pakistan) merchant HMAC helpers — placeholder algorithm aligned with common
 * "hash over pipe-separated order fields" patterns.
 *
 * **TODO (merchant pack):** Replace field order, encoding (hex vs base64), and message
 * content with the exact spec from Telenor EasyPaisa / easypay documentation.
 */

export const EASYPAISA_HASH_EXCLUDE = new Set(['hash', 'Hash', 'secureHash', 'callbackHash', 'orderHash']);

/**
 * Outbound: secure hash for hosted checkout / initiate request.
 * Current layout: HMAC-SHA256(hashKey) over `storeId|orderId|amountPaisa|msisdn|returnUrl` (lowercase string values).
 * Adjust in one place when docs specify a different string.
 */
export function buildEasypaisaRequestHash(
  hashKey: string,
  storeId: string,
  orderId: string,
  amountPaisa: string,
  msisdn: string,
  returnUrl: string,
): string {
  const msg = [storeId, orderId, amountPaisa, msisdn, returnUrl].join('|');
  return crypto.createHmac('sha256', hashKey).update(msg, 'utf8').digest('hex');
}

/**
 * Inbound: verify `hash` / `orderHash` from callback/return. Uses same HMAC and canonical message
 * built from the same ordered fields the gateway is expected to sign (default: all keys sorted,
 * k=v, excluding known hash field names) — **must be aligned to official callback doc**.
 */
export function buildEasypaisaCallbackStringForVerification(fields: Record<string, string>): string {
  return Object.keys(fields)
    .filter((k) => !EASYPAISA_HASH_EXCLUDE.has(k) && (fields[k] ?? '').toString() !== '')
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join('&');
}

export function verifyEasypaisaCallbackHmac(
  hashKey: string,
  providedHash: string,
  fields: Record<string, string>,
  mode: 'sorted_kv' = 'sorted_kv',
): boolean {
  if (!providedHash || !hashKey) {
    return false;
  }
  const msg = mode === 'sorted_kv' ? buildEasypaisaCallbackStringForVerification(fields) : '';
  const computed = crypto.createHmac('sha256', hashKey).update(msg, 'utf8').digest('hex');
  const a = Buffer.from(String(computed).trim(), 'utf8');
  const b = Buffer.from(String(providedHash).trim(), 'utf8');
  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}
