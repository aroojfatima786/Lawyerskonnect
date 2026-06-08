export type SuggestedLawyerItem = {
  _id: string;
  name: string;
  city: string;
  practiceAreas: string[];
  experienceYears?: number;
  rating?: number;
  consultationFee?: number;
  profileUrl: string;
  distanceKm?: number | null;
  nearby?: boolean;
  withinBudget?: boolean;
};

export type LegalChatPayload = {
  answer: string;
  case_type: string;
  next_steps: string[];
  suggested_lawyers: SuggestedLawyerItem[];
  confidence?: number;
  faq_used?: boolean;
};

const INTERNAL_PATTERNS = [
  /\badministrator[a-f0-9]+\.pdf\b/gi,
  /\b[a-f0-9]{20,}(?:\.pdf)?\b/gi,
  /::chunk-\d+/gi,
  /\b[\w./\\-]+\.(pdf|docx?|txt)\b/gi,
  /\bchunk-\d+\b/gi,
];

const REFERENCE_LEAK_SENTENCES: RegExp[] = [
  /[^.!?\n]*\b(?:provided|given|your|the)\s+legal\s+references?\b[^.!?\n]*[.!?]?/gi,
  /[^.!?\n]*\breferences?\s+(?:are|were|is)\s+(?:insufficient|not\s+(?:found|available))[^.!?\n]*[.!?]?/gi,
  /[^.!?\n]*\b(?:not|wasn't)\s+(?:found|available)\s+in\s+(?:the\s+)?references?[^.!?\n]*[.!?]?/gi,
  /[^.!?\n]*\bcould\s+not\s+find\s+(?:a\s+)?(?:verified\s+)?(?:legal\s+)?references?[^.!?\n]*[.!?]?/gi,
  /[^.!?\n]*\baccording\s+to\s+(?:the\s+)?(?:provided\s+)?references?[^.!?\n]*[.!?]?/gi,
  /[^.!?\n]*\bverified\s+legal\s+reference\s+nahi\s+mila[^.!?\n]*[.!?]?/gi,
  /[^.!?\n]*\bgeneral\s+legal\s+(?:information|info|guidance)\b[^.!?\n]*[.!?]?/gi,
];

/** Strip internal filenames, chunk IDs, paths, and boilerplate phrases from user-visible text. */
export function sanitizeDisplayText(text: string): string {
  let out = String(text || '');
  for (const pat of INTERNAL_PATTERNS) {
    out = out.replace(pat, '');
  }
  for (const pat of REFERENCE_LEAK_SENTENCES) {
    out = out.replace(pat, ' ');
  }
  out = out
    .replace(/\bthe\s+reference\s+you\s+(?:provided|gave)\b/gi, '')
    .replace(/\bno\s+verified\s+legal\s+reference\b/gi, '')
    .replace(/\(?\s*general\s+legal\s+(?:information|info|guidance)\s*(?:only)?\s*\)?/gi, '')
    .replace(/\bgeneral\s+legal\s+(?:information|info|guidance)\b/gi, '')
    .replace(/\bfor\s+general\s+informational\s+purposes\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return out;
}

/** Never surface raw JSON — normalize any API payload. */
export function normalizeLegalChatPayload(raw: unknown): LegalChatPayload | null {
  if (!raw) return null;

  let obj: Record<string, unknown> | null = null;

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          obj = parsed as Record<string, unknown>;
        } else {
          return { answer: sanitizeDisplayText(trimmed), case_type: '', next_steps: [], suggested_lawyers: [] };
        }
      } catch {
        return { answer: sanitizeDisplayText(trimmed), case_type: '', next_steps: [], suggested_lawyers: [] };
      }
    } else {
      return { answer: sanitizeDisplayText(trimmed), case_type: '', next_steps: [], suggested_lawyers: [] };
    }
  } else if (typeof raw === 'object' && !Array.isArray(raw)) {
    obj = raw as Record<string, unknown>;
  }

  if (!obj) return null;

  const answer = sanitizeDisplayText(pickString(obj, ['answer', 'message', 'text', 'content']));
  if (!answer) return null;

  const lawyersRaw = obj.suggested_lawyers ?? obj.suggestedLawyers;
  const stepsRaw = obj.next_steps ?? obj.nextSteps ?? obj.suggestedNextSteps;

  const caseType = sanitizeDisplayText(pickString(obj, ['case_type', 'category']));

  return {
    answer,
    case_type: caseType === 'Other' || caseType === 'General' ? '' : caseType,
    confidence: typeof obj.confidence === 'number' ? obj.confidence : undefined,
    faq_used: Boolean(obj.faq_used),
    next_steps: normalizeSteps(stepsRaw),
    suggested_lawyers: normalizeLawyers(lawyersRaw),
  };
}

function pickString(obj: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const val = obj[key];
    if (typeof val === 'string' && val.trim()) return val.trim();
  }
  return '';
}

function normalizeSteps(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s) => sanitizeDisplayText(String(s)))
    .filter(Boolean)
    .slice(0, 5);
}

function normalizeLawyers(raw: unknown): SuggestedLawyerItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((l) => l && typeof l === 'object' && (l as any)._id)
    .map((l: any) => ({
      _id: String(l._id),
      name: String(l.name || 'Lawyer'),
      city: String(l.city || ''),
      practiceAreas: Array.isArray(l.practiceAreas) ? l.practiceAreas.map(String) : [],
      experienceYears: l.experienceYears,
      rating: l.rating,
      consultationFee: l.consultationFee,
      profileUrl: String(l.profileUrl || `/lawyers/${l._id}`),
      distanceKm: typeof l.distanceKm === 'number' ? l.distanceKm : l.distanceKm ?? undefined,
      nearby: Boolean(l.nearby),
      withinBudget: Boolean(l.withinBudget),
    }))
    .slice(0, 5);
}

/** Turn plain / FAQ-style answers into markdown for conversational rendering. */
export function answerToMarkdown(answer: string): string {
  const lines = sanitizeDisplayText(answer).replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trim();
    i++;

    if (!line) {
      if (out.length && out[out.length - 1] !== '') out.push('');
      continue;
    }

    const next = i < lines.length ? lines[i].trim() : '';
    const isNumbered = (s: string) => /^\d+[\).:\-–—]\s*/.test(s);
    const isBullet = (s: string) => /^[-•*–—]\s+/.test(s);

    if (line.endsWith(':') && isNumbered(next)) {
      out.push(`## ${line.slice(0, -1).trim()}`);
      out.push('');
      continue;
    }

    if (isNumbered(line)) {
      while (i <= lines.length) {
        const current = i < lines.length ? lines[i].trim() : '';
        if (!current || !isNumbered(current)) break;
        const item = current.replace(/^\d+[\).:\-–—]\s*/, '').trim();
        out.push(`${out.filter((l) => /^\d+\.\s/.test(l)).length + 1}. ${item}`);
        i++;
      }
      out.push('');
      continue;
    }

    if (isBullet(line)) {
      while (i <= lines.length) {
        const current = i < lines.length ? lines[i].trim() : '';
        if (!current || !isBullet(current)) break;
        out.push(`- ${current.replace(/^[-•*–—]\s+/, '').trim()}`);
        i++;
      }
      out.push('');
      continue;
    }

    if (/^#{1,3}\s/.test(line)) {
      out.push(line);
      out.push('');
      continue;
    }

    out.push(line);
  }

  return out.join('\n').trim();
}

export function stepsToMarkdown(steps: string[]): string {
  if (!steps.length) return '';
  return steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
}

/** Citizen dashboard Find Lawyer vs public lawyers search */
export function findLawyerDirectoryPath(isCitizen: boolean, practiceArea?: string): string {
  const base = isCitizen ? '/client/find-lawyer' : '/lawyers';
  const area = String(practiceArea || '').trim();
  if (!area) return base;
  return `${base}?${new URLSearchParams({ practiceArea: area }).toString()}`;
}

const FIND_LAWYER_LINK_LABELS = ['lawyers directory', 'Find Lawyer section', 'Find Lawyer page'] as const;

/** True when a next-step line should link to Find Lawyer instead of plain text */
export function stepLinksToFindLawyer(step: string): boolean {
  const s = String(step || '').toLowerCase();
  return (
    /lawyers directory/.test(s) ||
    /find lawyer section/.test(s) ||
    /find lawyer page/.test(s) ||
    (/browse verified/.test(s) && /lawyer/.test(s))
  );
}

export function findLawyerLinkLabel(step: string): string {
  const s = String(step || '');
  for (const label of FIND_LAWYER_LINK_LABELS) {
    if (s.toLowerCase().includes(label.toLowerCase())) return label.replace(/\.$/, '');
  }
  if (/find lawyer section/i.test(s)) return 'Find Lawyer section';
  if (/find lawyer page/i.test(s)) return 'Find Lawyer page';
  return 'Find Lawyer';
}
