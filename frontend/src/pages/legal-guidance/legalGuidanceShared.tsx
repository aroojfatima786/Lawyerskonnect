import { FiAlertCircle, FiCpu } from 'react-icons/fi';
import { MAX_KYC_FILE_LABEL } from '../../constants/uploadLimits';
import type { Language } from './LegalGuidance';

export type SuggestedPromptCard = {
  label: string;
  prompt: string;
  language?: Language;
  preferredPracticeArea?: string;
};

export const SUGGESTED_PROMPT_CARDS: SuggestedPromptCard[] = [
  {
    label: 'How to book appointment',
    prompt: 'How do I book a lawyer appointment on LawyersKonnect? Please explain complete steps from choosing a lawyer to payment.',
  },
  {
    label: 'Cancel or reschedule',
    prompt: 'How can I cancel or reschedule my booked appointment in the app?',
  },
  {
    label: 'Payment methods',
    prompt: 'What payment methods are supported and how do I complete payment safely for consultation booking?',
  },
  {
    label: 'Upload documents',
    prompt: 'How do I upload legal documents in guidance chat, and what file types are supported?',
  },
  {
    label: 'How to choose lawyer',
    prompt: 'How should I choose the right verified lawyer for my case type in this app?',
  },
  {
    label: 'Security and privacy',
    prompt: 'How is my account and legal data protected? Also tell me what I should avoid sharing in chat.',
  },
  {
    label: 'Report fraud or abuse',
    prompt: 'If I suspect scam, fake lawyer profile, or abusive behavior, what should I do inside LawyersKonnect?',
  },
  {
    label: 'Urdu app guidance',
    prompt: 'براہ کرم مجھے LawyersKonnect app ka complete flow Urdu mein samjha dein: lawyer selection, appointment booking, payment, aur security tips.',
    language: 'urdu',
  },
];

export function mapLegalGuidanceError(err: unknown): string {
  const e = err as { status?: number; code?: string; message?: string };
  const code = e?.code;
  const status = e?.status;
  const rawMessage = typeof e?.message === 'string' ? e.message.trim() : '';

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return 'You appear to be offline. Check your connection and try again.';
  }

  if (status === 0 || /failed to fetch|networkerror|load failed/i.test(rawMessage)) {
    return 'Unable to reach the guidance service. Check your connection and try again.';
  }

  if (status === 502 || status === 503 || status === 504) {
    return 'The guidance service is temporarily unavailable. Please try again in a few minutes.';
  }

  if (code === 'FILE_TOO_LARGE') {
    return `The file is too large. Please use a document under ${MAX_KYC_FILE_LABEL}.`;
  }
  if (code === 'UNSUPPORTED_DOCUMENT_TYPE') {
    return 'That file type is not supported. Upload TXT, PDF, DOC, or DOCX, or type your question instead.';
  }
  if (code === 'DOCUMENT_TEXT_EXTRACTION_FAILED') {
    return 'We could not read text from that document. Try a text-based PDF or paste your question.';
  }
  if (code === 'AI_NOT_CONFIGURED') {
    return 'Full AI generation is not configured. Knowledge-base guidance is still available.';
  }

  if (status === 400) {
    if (/message or caseText/i.test(rawMessage)) {
      return 'Please describe your legal question or upload a supported document.';
    }
    if (/too long/i.test(rawMessage)) {
      return 'Your message is too long. Please shorten it and try again.';
    }
    return 'Please check your question or document and try again.';
  }

  if (status && status >= 500) {
    return 'Something went wrong on our side. Please try again shortly.';
  }

  if (rawMessage && !isTechnicalMessage(rawMessage)) {
    return rawMessage;
  }

  return 'We could not process your legal guidance request. Please try again.';
}

function isTechnicalMessage(message: string): boolean {
  return (
    /^[A-Z_]{3,}$/.test(message) ||
    /HttpException|ECONNREFUSED|ENOTFOUND|Bad Gateway|Internal Server Error/i.test(message)
  );
}

export function LimitedModeBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-amber-200/90 bg-amber-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-900 ring-1 ring-amber-100 ${className}`}
      title="Responses use the legal knowledge base and verified lawyer directory; generative AI is not active."
    >
      <FiCpu className="text-amber-700" aria-hidden />
      Knowledge-base guidance mode
    </span>
  );
}

export function GuidanceErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-900 ring-1 ring-rose-100">
      <FiAlertCircle className="mt-0.5 shrink-0 text-rose-600" aria-hidden />
      <p className="leading-relaxed">{message}</p>
    </div>
  );
}
