import { Link } from 'react-router-dom';
import { FiCpu, FiArrowRight } from 'react-icons/fi';
import { Button } from '../ui';
import { GradientAnimatedHeadline } from './GradientAnimatedHeadline';
import { CITIZEN_LEGAL_GUIDANCE_PATH, PUBLIC_LEGAL_GUIDANCE_PATH } from '../../constants/legalGuidanceRoutes';

const AI_GUIDANCE_CTA_LINES = [
  'Not sure which lawyer you need?',
  'Ask the AI Legal Guidance Assistant first.',
  'Describe your issue and get suggested practice areas before booking.',
];

export function FindLawyersAiGuidanceCta({ isDashboard }: { isDashboard?: boolean }) {
  const guidancePath = isDashboard ? CITIZEN_LEGAL_GUIDANCE_PATH : PUBLIC_LEGAL_GUIDANCE_PATH;

  return (
    <section
      className={`border-b border-slate-200/70 ${isDashboard ? 'py-5' : 'py-6 sm:py-7'}`}
      aria-live="polite"
    >
      <div className={`mx-auto max-w-2xl text-center ${isDashboard ? 'px-4' : 'lk-page-wide px-5 sm:px-8'}`}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-lk-muted">AI legal guidance</p>
        <GradientAnimatedHeadline
          lines={AI_GUIDANCE_CTA_LINES}
          mode="words"
          className="mt-3 min-h-[3rem] text-balance text-lg sm:min-h-[3.25rem] sm:text-xl"
        />
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-lk-muted">
          {isDashboard
            ? 'Get initial direction and lawyer categories before you book.'
            : 'Sign in as a citizen to use AI guidance — we will take you to login first.'}
        </p>
        <Link to={guidancePath} className="mt-4 inline-block">
          <Button size="md" leftIcon={<FiCpu />} rightIcon={<FiArrowRight />}>
            Try AI Legal Guidance
          </Button>
        </Link>
      </div>
    </section>
  );
}
