/** Pakistani CNIC: exactly 13 digits, commonly shown as 12345-1234567-1 */

export const CNIC_DIGIT_COUNT = 13;

export const CNIC_FORMAT_HINT = '12345-1234567-1';

export function getCnicDigits(value: string): string {
  return String(value || '').replace(/\D/g, '').slice(0, CNIC_DIGIT_COUNT);
}

export function formatCnicInput(value: string): string {
  const digits = getCnicDigits(value);
  if (digits.length <= 5) return digits;
  if (digits.length <= 12) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
}

export function validateCnic(value: string, options?: { required?: boolean }): {
  valid: boolean;
  message?: string;
} {
  const digits = getCnicDigits(value);
  if (!digits) {
    if (options?.required) {
      return { valid: false, message: 'CNIC is required.' };
    }
    return { valid: true };
  }
  if (digits.length !== CNIC_DIGIT_COUNT) {
    return {
      valid: false,
      message: `CNIC must be exactly ${CNIC_DIGIT_COUNT} digits (e.g. ${CNIC_FORMAT_HINT}). You entered ${digits.length} digit${digits.length === 1 ? '' : 's'}.`,
    };
  }
  return { valid: true };
}

export const CNIC_MISMATCH_MESSAGE =
  'CNIC mismatch. Re-enter the number printed on your card and run the check again.';

export const CNIC_UNREADABLE_MESSAGE =
  'Could not read CNIC from your card photo. Re-enter your CNIC or upload a clearer CNIC front, then try again.';

export function isCnicMismatchError(message: string): boolean {
  const m = String(message || '');
  return (
    /cnic mismatch/i.test(m) ||
    (/profile form has/i.test(m) && /card photo was read/i.test(m))
  );
}

/** Never show both CNIC numbers in the UI (handles old backend messages too). */
export function normalizeKycCheckError(message: string): string {
  const m = String(message || '').trim();
  if (!m) return 'Identity check failed.';
  if (isCnicMismatchError(m)) return CNIC_MISMATCH_MESSAGE;
  if (/could not read cnic/i.test(m)) return CNIC_UNREADABLE_MESSAGE;
  return m;
}
