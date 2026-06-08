export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function truncateToWordLimit(text: string, maxWords: number): string {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= maxWords) return text;
  return parts.slice(0, maxWords).join(' ');
}

export const BIO_MAX_WORDS = 200;
export const BIO_MIN_WORDS = 0;
export const COMPLAINT_MAX_WORDS = 300;
export const COMPLAINT_MAX_SUBJECT = 120;
