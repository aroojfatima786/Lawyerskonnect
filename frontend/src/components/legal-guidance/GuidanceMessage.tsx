import { Link } from 'react-router-dom';
import { FiBriefcase, FiFileText, FiMapPin, FiStar, FiUser } from 'react-icons/fi';
import { useAuth } from '../../context/AuthContext';
import { MarkdownContent } from './MarkdownContent';
import {
  answerToMarkdown,
  findLawyerDirectoryPath,
  findLawyerLinkLabel,
  normalizeLegalChatPayload,
  stepLinksToFindLawyer,
  type LegalChatPayload,
  type SuggestedLawyerItem,
} from './formatLegalResponse';

function FindLawyerInlineLink({
  step,
  findLawyerTo,
}: {
  step: string;
  findLawyerTo: string;
}) {
  const label = findLawyerLinkLabel(step);
  const idx = step.toLowerCase().indexOf(label.toLowerCase());
  if (idx < 0) {
    return (
      <Link to={findLawyerTo} className="font-semibold text-lk-accent hover:underline">
        Find Lawyer
      </Link>
    );
  }
  const before = step.slice(0, idx);
  const after = step.slice(idx + label.length);
  return (
    <>
      {before}
      <Link to={findLawyerTo} className="font-semibold text-lk-accent hover:underline">
        {label}
      </Link>
      {after}
    </>
  );
}

function RecommendedSteps({
  steps,
  findLawyerTo,
}: {
  steps: string[];
  findLawyerTo: string;
}) {
  return (
    <div className="space-y-2 border-t border-slate-100 pt-3">
      <p className="text-sm font-semibold text-lk-navy">Recommended next steps</p>
      <ol className="ml-1 list-decimal space-y-1.5 pl-5 marker:font-medium marker:text-lk-accent">
        {steps.map((step, j) => (
          <li key={j} className="text-[0.9375rem] leading-[1.65] text-lk-navy">
            {stepLinksToFindLawyer(step) ? (
              <FindLawyerInlineLink step={step} findLawyerTo={findLawyerTo} />
            ) : (
              step
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

function LawyerCard({ lawyer }: { lawyer: SuggestedLawyerItem }) {
  const { user } = useAuth();
  const isCitizen = user?.role === 'citizen';
  const id = lawyer._id;

  let profileTo = `/lawyers/${id}`;
  if (lawyer.profileUrl?.startsWith('/lawyers/') && isCitizen) profileTo = `/client${lawyer.profileUrl}`;
  else if (isCitizen) profileTo = `/client/lawyers/${id}`;
  else if (lawyer.profileUrl) profileTo = lawyer.profileUrl;

  const bookTo = isCitizen ? `/client/appointments/book/${id}` : '/auth/citizen/login';

  return (
    <div className="rounded-xl border border-slate-200/90 bg-gradient-to-br from-white to-slate-50/80 p-4 shadow-sm ring-1 ring-slate-100/80 transition hover:border-blue-200/60">
      <div className="flex gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-lk-accent/10 text-lk-accent">
          <FiUser className="text-lg" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-lk-navy">{lawyer.name}</p>
          {lawyer.city ? (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-lk-muted">
              <FiMapPin className="shrink-0" />
              {lawyer.distanceKm != null ? (
                <span>
                  {lawyer.city} · {lawyer.distanceKm.toFixed(1)} km away
                </span>
              ) : (
                lawyer.city
              )}
              {lawyer.nearby ? (
                <span className="ml-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                  Nearby
                </span>
              ) : null}
            </p>
          ) : null}
          {lawyer.practiceAreas.length > 0 ? (
            <p className="mt-1 flex items-start gap-1 text-xs text-lk-muted">
              <FiBriefcase className="mt-0.5 shrink-0" />
              <span>{lawyer.practiceAreas.slice(0, 3).join(' · ')}</span>
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-lk-muted">
            {lawyer.rating != null && lawyer.rating > 0 ? (
              <span className="inline-flex items-center gap-0.5 font-medium text-amber-700">
                <FiStar className="fill-amber-400 text-amber-400" />
                {Number(lawyer.rating).toFixed(1)}
              </span>
            ) : null}
            {lawyer.experienceYears != null ? <span>{lawyer.experienceYears}y experience</span> : null}
            {lawyer.consultationFee != null ? (
              <span className="font-medium text-lk-navy">Rs. {Number(lawyer.consultationFee).toLocaleString()}</span>
            ) : null}
            {lawyer.withinBudget ? (
              <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                Within budget
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          to={profileTo}
          className="inline-flex min-h-[36px] items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-lk-navy transition hover:bg-slate-50"
        >
          View profile
        </Link>
        <Link
          to={bookTo}
          className="inline-flex min-h-[36px] items-center rounded-lg bg-lk-accent px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700"
        >
          {isCitizen ? 'Book consultation' : 'Sign in to book'}
        </Link>
      </div>
    </div>
  );
}

export function GuidanceMessage({ result }: { result: unknown }) {
  const { user } = useAuth();
  const isCitizen = user?.role === 'citizen';
  const payload: LegalChatPayload | null = normalizeLegalChatPayload(result);
  if (!payload?.answer) {
    return (
      <p className="text-sm text-lk-muted">
        I couldn&apos;t process that response. Please try asking your question again.
      </p>
    );
  }

  const isLegalResponse = Boolean(payload.case_type || payload.next_steps.length || payload.suggested_lawyers.length);
  const explanationMd = answerToMarkdown(payload.answer);
  const findLawyerTo = findLawyerDirectoryPath(isCitizen, payload.case_type);

  return (
    <div className="space-y-4">
      {payload.case_type ? (
        <div className="inline-flex items-center rounded-lg border border-blue-200/80 bg-blue-50/90 px-3 py-1.5">
          <p className="text-xs font-semibold text-lk-navy">
            Case category: <span className="text-lk-accent">{payload.case_type}</span>
          </p>
        </div>
      ) : null}

      <MarkdownContent content={explanationMd} />

      {payload.next_steps.length > 0 ? (
        <RecommendedSteps steps={payload.next_steps} findLawyerTo={findLawyerTo} />
      ) : null}

      {payload.suggested_lawyers.length > 0 ? (
        <div className="space-y-2.5 border-t border-slate-100 pt-3">
          <p className="text-sm font-semibold text-lk-navy">
            Suggested lawyers{payload.suggested_lawyers.some((l) => l.nearby) ? ' near you' : ''}
          </p>
          <div className="space-y-2.5">
            {payload.suggested_lawyers.map((lawyer) => (
              <LawyerCard key={lawyer._id} lawyer={lawyer} />
            ))}
          </div>
        </div>
      ) : null}

      {isLegalResponse ? <div className="border-t border-slate-100 pt-1" /> : null}
    </div>
  );
}

export function UserChatBubble({ text, fileName }: { text?: string; fileName?: string }) {
  return (
    <div className="space-y-2">
      {text ? <p className="whitespace-pre-wrap text-sm leading-relaxed">{text}</p> : null}
      {fileName ? (
        <div className="flex items-center gap-2.5 rounded-lg border border-white/20 bg-white/10 px-3 py-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15">
            <FiFileText className="text-base" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-white/95">Document uploaded</p>
            <p className="text-[10px] text-white/65">Attached for legal review</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
