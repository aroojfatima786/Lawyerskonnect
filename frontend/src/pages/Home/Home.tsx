import { useNavigate, Link } from 'react-router-dom';
import {
  FaSearch,
  FaCheckCircle,
  FaShieldAlt,
  FaCalendarCheck,
  FaComments,
  FaLock,
  FaUserCheck,
  FaCreditCard,
  FaHome,
  FaBuilding,
  FaGavel,
  FaKey,
  FaBriefcase,
  FaHardHat,
  FaArrowRight,
  FaFileAlt,
  FaUserTie,
} from 'react-icons/fa';
import { FiArrowRight } from 'react-icons/fi';
import { Footer, Navbar } from '../../components/layouts';
import { HomeHeroLegalAtmosphere } from '../../components/public/LegalMotifs';
import { HomeHeroDemoMedia } from '../../components/public/HomeHeroDemoMedia';
import { Reveal } from '../../components/public/Reveal';
import { useEffect, useState, type ReactNode } from 'react';
import { publicApi, lawyerApi } from '../../services/api';

type PublicStats = {
  verifiedLawyers: number;
  totalAppointments: number;
  citiesCovered: number;
};

/** Display label → practiceArea query (aligned with common directory naming) */
const legalCategories: Array<{ label: string; query: string; icon: ReactNode; accent: string; cardBg: string }> = [
  { label: 'Family Law', query: 'Family', icon: <FaHome className="text-xl" />, accent: 'from-rose-100 to-rose-50 ring-rose-200/80 text-rose-700', cardBg: 'from-slate-50 via-rose-50/45 to-blue-50/25 ring-rose-100/50 shadow-md shadow-slate-900/8' },
  { label: 'Property Law', query: 'Property', icon: <FaBuilding className="text-xl" />, accent: 'from-emerald-100 to-sky-50 ring-emerald-200/70 text-emerald-800', cardBg: 'from-slate-50 via-emerald-50/40 to-sky-50/30 ring-emerald-100/50 shadow-md shadow-slate-900/8' },
  { label: 'Criminal Law', query: 'Criminal', icon: <FaGavel className="text-xl" />, accent: 'from-amber-100 to-amber-50 ring-amber-200/70 text-amber-900', cardBg: 'from-slate-50 via-amber-50/38 to-blue-50/22 ring-amber-100/55 shadow-md shadow-slate-900/8' },
  { label: 'Rent Law', query: 'Rent', icon: <FaKey className="text-xl" />, accent: 'from-violet-100 to-violet-50 ring-violet-200/70 text-violet-900', cardBg: 'from-slate-50 via-violet-50/35 to-blue-50/28 ring-violet-100/50 shadow-md shadow-slate-900/8' },
  { label: 'Business Law', query: 'Business', icon: <FaBriefcase className="text-xl" />, accent: 'from-indigo-100 to-indigo-50 ring-indigo-200/70 text-indigo-900', cardBg: 'from-slate-50 via-indigo-50/38 to-blue-50/25 ring-indigo-100/50 shadow-md shadow-slate-900/8' },
  { label: 'Labour Law', query: 'Labour', icon: <FaHardHat className="text-xl" />, accent: 'from-cyan-100 to-cyan-50 ring-cyan-200/70 text-cyan-900', cardBg: 'from-slate-50 via-cyan-50/35 to-blue-50/28 ring-cyan-100/45 shadow-md shadow-slate-900/8' },
];

/** Premium credibility strip (hero footer) */
const credibilityStrip: Array<{ icon: ReactNode; title: string; sub: string }> = [
  { icon: <FaUserCheck className="text-lg text-emerald-300" />, title: 'Verified listings', sub: 'Reviewed directory' },
  { icon: <FaShieldAlt className="text-lg text-blue-200" />, title: 'Admin-reviewed KYC', sub: 'Credential gates' },
  { icon: <FaComments className="text-lg text-slate-200" />, title: 'Secure chat', sub: 'Booking-linked' },
  { icon: <FaLock className="text-lg text-amber-200/90" />, title: 'Escrow payments', sub: 'Milestone release' },
  { icon: <FaSearch className="text-lg text-cyan-200" />, title: 'Smart search', sub: 'By area & city' },
];

const howSteps = [
  {
    step: 1,
    title: 'Intake',
    desc: 'Search verified lawyers by practice area, city, and fee.',
    icon: <FaFileAlt className="text-lg text-lk-accent" />,
  },
  {
    step: 2,
    title: 'Lawyer match',
    desc: 'Compare verified profiles, fees, and practice fit before you request time.',
    icon: <FaUserTie className="text-lg text-lk-accent" />,
  },
  {
    step: 3,
    title: 'Booking',
    desc: 'Request and confirm a slot — timeline stays visible to both sides.',
    icon: <FaCalendarCheck className="text-lg text-lk-accent" />,
  },
  {
    step: 4,
    title: 'Payment',
    desc: 'Consultation fees route through platform checkout and escrow rules.',
    icon: <FaCreditCard className="text-lg text-lk-accent" />,
  },
  {
    step: 5,
    title: 'Consultation',
    desc: 'Message and meet through LawyersKonnect once your booking is active.',
    icon: <FaComments className="text-lg text-lk-accent" />,
  },
];

export default function Home() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<PublicStats | null>(null);
  const [statsError, setStatsError] = useState(false);
  const [categoryCount, setCategoryCount] = useState<number>(0);
  const [categoriesLoaded, setCategoriesLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res: any = await publicApi.getStats();
        const d = res?.data ?? res;
        if (cancelled || !d) return;
        setStats({
          verifiedLawyers: Number(d.verifiedLawyers) || 0,
          totalAppointments: Number(d.totalAppointments) || 0,
          citiesCovered: Number(d.citiesCovered) || 0,
        });
      } catch {
        if (!cancelled) setStatsError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res: any = await lawyerApi.getCategories();
        const list = (res as any)?.data ?? [];
        if (!cancelled) setCategoryCount(Array.isArray(list) ? list.length : 0);
      } catch {
        if (!cancelled) setCategoryCount(0);
      } finally {
        if (!cancelled) setCategoriesLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const v = stats ?? { verifiedLawyers: 0, totalAppointments: 0, citiesCovered: 0 };
  const hasLiveStats = !statsError && stats !== null;

  return (
    <div className="min-h-screen overflow-x-hidden bg-gradient-to-b from-[#F3F7FD] via-[#EEF4FA] to-[#E8EEF6]">
      <Navbar />

      {/* Hero — legal-premium marketplace */}
      <section className="relative flex min-h-[min(78vh,52rem)] flex-col overflow-hidden border-b border-slate-900/90 bg-[#050a14] text-white">
        <HomeHeroLegalAtmosphere />
        <div className="pointer-events-none absolute left-1/2 top-[-18%] z-20 h-[min(520px,90vw)] w-[min(520px,90vw)] -translate-x-1/2 rounded-full bg-blue-500/14 blur-[100px]" />
        <div className="pointer-events-none absolute bottom-12 right-1/4 z-20 h-40 w-40 rounded-full bg-amber-400/10 blur-3xl" />
        <div className="relative z-30 mx-auto flex w-full max-w-wide flex-1 flex-col px-4 pb-6 pt-16 sm:px-5 sm:pb-8 sm:pt-20 lg:px-6 lg:pb-10 lg:pt-24">
          <div className="lg:p-8">
          <div className="lg:grid lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:gap-12">
          <div className="relative max-w-xl">
            <p
              className="lk-hero-enter mb-5 inline-flex items-center gap-2 rounded-full border border-amber-400/25 bg-white/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-white/95 shadow-lg shadow-black/20 ring-1 ring-white/20 backdrop-blur-md"
              style={{ animationDelay: '0.06s' }}
            >
              <FaShieldAlt className="text-emerald-400" />
              Secure legal marketplace · Pakistan
            </p>
            <h1
              className="lk-hero-enter text-balance font-serif text-3xl font-bold leading-[1.12] tracking-tight drop-shadow-[0_2px_24px_rgba(0,0,0,0.35)] sm:text-4xl lg:text-[2.75rem] lg:leading-[1.08]"
              style={{ animationDelay: '0.14s' }}
            >
              Verified lawyers, secure payments — one legal marketplace
            </h1>
            <p
              className="lk-hero-enter mt-6 max-w-lg text-base leading-relaxed text-white/90 drop-shadow-sm sm:text-lg sm:leading-relaxed"
              style={{ animationDelay: '0.24s' }}
            >
              Book consultations, pay through platform escrow, and message counsel — all in one place built for Pakistan.
            </p>
            <div className="lk-hero-enter mt-9 flex flex-wrap gap-3" style={{ animationDelay: '0.34s' }}>
              <button
                type="button"
                onClick={() => navigate('/lawyers')}
                className="lk-btn-lift inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-lk-accent px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-950/45 ring-2 ring-white/15 transition hover:bg-blue-600 hover:shadow-xl"
              >
                <FaSearch className="opacity-95" />
                Find a Lawyer
                <FiArrowRight className="opacity-95" />
              </button>
              <button
                type="button"
                onClick={() => navigate('/register')}
                className="lk-btn-lift inline-flex min-h-[48px] items-center gap-2 rounded-xl border border-white/30 bg-white/12 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-black/10 ring-1 ring-white/20 backdrop-blur-md transition hover:bg-white/20"
              >
                Get started
                <FiArrowRight className="opacity-95" />
              </button>
            </div>
          </div>

          <div className="relative z-30 mt-14 min-w-0 lg:mt-0">
            <div className="pointer-events-none absolute -right-4 top-1/2 z-0 hidden h-[120%] w-[85%] -translate-y-1/2 rounded-full bg-blue-500/20 blur-[70px] lg:block" aria-hidden />
            <div className="lk-hero-enter-right will-change-transform" style={{ animationDelay: '0.18s' }}>
              <HomeHeroDemoMedia />
            </div>
          </div>
          </div>
          </div>
        </div>

        <div
          className="relative z-30 mt-auto border-t border-amber-400/15 bg-gradient-to-r from-slate-950/95 via-[#102A43]/95 to-slate-950/95 py-4 sm:py-5"
          aria-label="Platform credibility"
        >
          <div className="mx-auto hidden max-w-wide items-stretch justify-between gap-2 px-4 sm:px-5 lg:flex lg:px-6">
            {credibilityStrip.map((item, i) => (
              <div key={item.title} className="flex min-w-0 flex-1 items-center gap-3">
                {i > 0 ? <div className="hidden h-10 w-px shrink-0 bg-gradient-to-b from-transparent via-amber-400/35 to-transparent lg:block" aria-hidden /> : null}
                <div className="flex min-w-0 items-center gap-3 pl-0 lg:pl-2">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/[0.08] shadow-inner ring-1 ring-amber-400/10">
                    {item.icon}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold leading-tight text-white">{item.title}</p>
                    <p className="text-[11px] leading-tight text-white/55">{item.sub}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-3 overflow-x-auto px-4 pb-1 pt-0.5 [-ms-overflow-style:none] [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden">
            {credibilityStrip.map((item) => (
              <div
                key={item.title}
                className="flex min-w-[200px] shrink-0 items-center gap-2.5 rounded-xl border border-white/12 bg-white/[0.06] px-3 py-2.5 ring-1 ring-amber-400/10"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.07]">{item.icon}</div>
                <div>
                  <p className="text-xs font-semibold text-white">{item.title}</p>
                  <p className="text-[10px] text-white/55">{item.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Soft bridge: hero navy → stats band (no hard cut) */}
      <div
        className="pointer-events-none h-8 w-full bg-gradient-to-b from-slate-900 via-slate-800/65 to-blue-50/95 sm:h-10 md:h-12"
        aria-hidden
      />

      {/* Live stats — soft band aligned with Services journey section */}
      <section className="relative overflow-hidden border-t border-[#D8E2F0]/80 bg-gradient-to-b from-[#E8EEF8] via-[#F0F5FB] to-[#E8F0FA] pb-14 pt-8 sm:pb-16 sm:pt-10 md:pb-16">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage: 'radial-gradient(rgb(16 42 67 / 0.06) 1px, transparent 1px)',
            backgroundSize: '22px 22px',
          }}
          aria-hidden
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-blue-100/25 via-transparent to-indigo-100/20" aria-hidden />
        <div className="pointer-events-none absolute -left-24 bottom-0 h-64 w-64 rounded-full bg-blue-300/20 blur-3xl" />
        <div className="pointer-events-none absolute -right-16 top-4 h-52 w-52 rounded-full bg-indigo-200/18 blur-3xl" />
        <div className="relative z-[2] lk-page-wide">
          <Reveal className="mb-8 text-center sm:mb-10">
            <span className="public-kicker">Platform proof</span>
            <h2 className="lk-section-title mx-auto mt-2 max-w-2xl text-center text-xl sm:text-2xl">Numbers from the marketplace</h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-lk-muted sm:text-base">
              Pulled from live APIs when available — zeros simply mean nothing recorded yet.
              {!hasLiveStats && (
                <span className="block pt-1 text-lk-muted">
                  {statsError ? 'Could not load counts right now.' : 'Loading…'}
                </span>
              )}
            </p>
          </Reveal>
          <Reveal variant="scale" delayMs={50}>
          <div className="rounded-2xl border border-[#D8E2F0] bg-gradient-to-br from-white/95 via-[#F3F7FD] to-blue-50/50 p-5 shadow-[0_20px_50px_-24px_rgba(15,23,42,0.2)] ring-1 ring-slate-200/60 sm:p-7 md:p-8">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-5">
            <Reveal delayMs={0}><PremiumStatCard icon={<FaUserCheck />} label="Verified lawyers" value={v.verifiedLawyers} hint="Listed profiles passing review." highlight /></Reveal>
            <Reveal delayMs={70}><PremiumStatCard icon={<FaCalendarCheck />} label="Consultations" value={v.totalAppointments} hint="Recorded booking volume." /></Reveal>
            <Reveal delayMs={140}>
            <PremiumStatCard
              icon={<FaBriefcase />}
              label="Practice categories"
              value={categoriesLoaded ? categoryCount : '—'}
              hint="Taxonomy breadth in directory."
              loading={!categoriesLoaded}
            />
            </Reveal>
            <Reveal delayMs={210}><PremiumStatCard icon={<FaBuilding />} label="Cities" value={v.citiesCovered} hint="Coverage from listings." /></Reveal>
            </div>
          </div>
          </Reveal>
        </div>
      </section>

      {/* How it works — full-width tinted band */}
      <section id="how-it-works" className="relative scroll-mt-24 overflow-hidden border-t border-[#D8E2F0]/60 bg-gradient-to-b from-[#102A43]/[0.04] via-[#F3F7FD] to-[#EEF4FA] py-14 sm:py-16 lg:py-20">
        <div className="pointer-events-none absolute left-1/2 top-8 h-56 w-[min(90vw,520px)] -translate-x-1/2 rounded-full bg-blue-200/25 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute inset-0 opacity-[0.2]" aria-hidden style={{ backgroundImage: 'radial-gradient(rgb(148 163 184 / 0.25) 0.5px, transparent 0.5px)', backgroundSize: '20px 20px' }} />
        <div className="relative z-[1] lk-page-wide">
          <Reveal className="mx-auto mb-10 max-w-2xl text-center lg:mb-12">
            <span className="public-kicker-muted">Your case journey</span>
            <h2 className="mt-2 text-center text-xl font-bold tracking-tight text-lk-navy sm:text-2xl">From intake to consultation</h2>
            <p className="mt-3 text-sm leading-relaxed text-lk-muted sm:text-base">A clear sequence from search to consultation — all inside LawyersKonnect.</p>
          </Reveal>

          <div className="relative hidden lg:block">
            <div
              className="pointer-events-none absolute left-[6%] right-[6%] top-[26px] h-[2px] bg-gradient-to-r from-transparent via-amber-500/35 to-transparent"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute left-[6%] right-[6%] top-[28px] h-px bg-gradient-to-r from-transparent via-lk-accent/55 to-transparent shadow-[0_0_16px_rgba(37,99,235,0.2)]"
              aria-hidden
            />
            <div className="grid grid-cols-5 gap-3">
              {howSteps.map((s, i) => (
                <Reveal key={s.step} delayMs={i * 75}>
                <div className="flex flex-col items-center text-center">
                  <div className="relative z-[1] flex h-[52px] w-[52px] items-center justify-center rounded-full bg-gradient-to-br from-lk-accent to-[#12355B] text-base font-bold text-white shadow-lg shadow-slate-900/30 ring-4 ring-amber-400/15 ring-offset-2 ring-offset-[#F3F7FD]">
                    {s.step}
                  </div>
                  <div className="lk-card-lift group mt-5 w-full rounded-xl border border-[#D8E2F0] bg-gradient-to-b from-white to-blue-50/30 px-3 py-4 shadow-md shadow-slate-900/8 duration-300 hover:border-blue-200/70 hover:shadow-lg">
                    <div className="mb-2 flex justify-center transition-transform duration-300 group-hover:scale-105">{s.icon}</div>
                    <h3 className="text-xs font-bold uppercase tracking-wide text-lk-navy">{s.title}</h3>
                    <p className="mt-2 text-[11px] leading-relaxed text-lk-muted">{s.desc}</p>
                  </div>
                </div>
                </Reveal>
              ))}
            </div>
          </div>

          <div className="relative space-y-0 lg:hidden">
            <div className="absolute left-[21px] top-3 bottom-3 w-px bg-gradient-to-b from-lk-accent/50 via-amber-400/30 to-lk-border" aria-hidden />
            <div className="space-y-7">
              {howSteps.map((s, i) => (
                <Reveal key={s.step} delayMs={i * 80}>
                <div className="relative flex gap-5 pl-1">
                  <div className="relative z-[1] flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-lk-accent to-blue-900 text-xs font-bold text-white shadow-md ring-2 ring-amber-400/20">{s.step}</div>
                  <div className="lk-card-lift min-w-0 flex-1 rounded-xl border border-[#D8E2F0] bg-gradient-to-br from-white to-blue-50/25 px-4 py-3 shadow-md shadow-slate-900/8 duration-300 hover:border-blue-200/70">
                    <div className="mb-1 flex items-center gap-2">{s.icon}<span className="text-sm font-bold text-lk-navy">{s.title}</span></div>
                    <p className="text-xs leading-relaxed text-lk-muted">{s.desc}</p>
                  </div>
                </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Categories — full-width band, distinct tint */}
      <section id="categories" className="relative scroll-mt-24 overflow-hidden bg-gradient-to-br from-[#EEF5FF] via-slate-50 to-blue-50/45 py-12 sm:py-16 lg:py-16">
        <div className="pointer-events-none absolute -left-16 bottom-8 h-72 w-72 rounded-full bg-indigo-200/28 blur-3xl" />
        <div className="pointer-events-none absolute right-0 top-12 h-48 w-48 rounded-full bg-blue-200/22 blur-3xl" />
        <div className="relative z-[1] lk-page-wide">
          <Reveal className="mx-auto mb-8 max-w-2xl text-center sm:mb-9">
            <span className="public-kicker">Browse</span>
            <h2 className="lk-section-title mt-2 text-center">Popular practice areas</h2>
            <p className="mt-3 text-sm text-lk-muted sm:text-base">Open the directory pre-filtered — fees and reviews appear on profiles.</p>
          </Reveal>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {legalCategories.map(({ label, query, icon, accent, cardBg }, i) => (
              <Reveal key={label} delayMs={i * 60}>
              <Link
                to={`/lawyers?practiceArea=${encodeURIComponent(query)}`}
                className={`lk-card-lift group relative block overflow-hidden rounded-xl border border-[#D8E2F0] bg-gradient-to-br p-6 shadow-[0_16px_40px_-20px_rgba(15,23,42,0.15)] ring-1 ring-amber-400/15 transition duration-300 hover:border-blue-200/80 hover:shadow-xl hover:ring-amber-400/25 sm:p-7 ${cardBg}`}
              >
                <div className="relative flex items-start gap-4">
                  <div
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br shadow-inner ring-2 transition-transform duration-300 group-hover:scale-105 ${accent}`}
                  >
                    {icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-lk-navy">{label}</h3>
                    <p className="mt-1 text-xs text-lk-muted sm:text-sm">Tailored lawyer list</p>
                    <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-lk-accent">
                      Open directory <FaArrowRight className="text-xs transition group-hover:translate-x-0.5" />
                    </span>
                  </div>
                </div>
              </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Light → dark: full-width gradient bridge + flat escrow band */}
      <div className="relative z-[1] overflow-hidden">
        <div className="h-12 bg-gradient-to-b from-[#EEF4FA] via-slate-400/45 to-slate-950 sm:h-14 md:h-16" aria-hidden />
        <section className="relative overflow-hidden bg-[#070d18] pb-16 pt-12 text-white sm:pb-20 sm:pt-14">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#102A43]/50 via-transparent to-slate-950" />
        <div className="pointer-events-none absolute left-1/4 top-0 h-72 w-72 rounded-full bg-blue-600/20 blur-[90px]" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-80 w-80 rounded-full bg-amber-500/5 blur-[100px]" />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '22px 22px' }}
        />
        <div className="relative z-[1] lk-page-wide">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center lg:gap-12">
            <Reveal>
            <div>
              <span className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-400/90">Payment infrastructure</span>
              <h2 className="mt-3 font-serif text-2xl font-bold leading-snug tracking-tight text-white sm:text-3xl">Consultation fees stay under platform accountability</h2>
              <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/75 sm:text-base">
                Funds are routed through LawyersKonnect checkout and released when the consultation completes under platform rules — clear milestones instead of informal transfers.
              </p>
              <ul className="mt-8 space-y-4 text-sm text-white/90">
                <li className="flex gap-3">
                  <FaCheckCircle className="mt-0.5 shrink-0 text-emerald-400" />
                  See consultation pricing before you confirm
                </li>
                <li className="flex gap-3">
                  <FaCheckCircle className="mt-0.5 shrink-0 text-emerald-400" />
                  Milestone-based release instead of informal transfers
                </li>
                <li className="flex gap-3">
                  <FaCheckCircle className="mt-0.5 shrink-0 text-emerald-400" />
                  Chat access follows your booking state
                </li>
              </ul>
            </div>
            </Reveal>
            <Reveal variant="right" delayMs={80}>
            <EscrowFlowVisual dark />
            </Reveal>
          </div>
        </div>
        </section>
      </div>


      {/* Compact glance */}
      <section className="bg-gradient-to-r from-slate-200/40 via-[#F0F6FD] to-sky-50/45 py-7 sm:py-8">
        <div className="lk-page-wide flex flex-wrap items-center justify-center gap-2 sm:gap-3">
          {['Directory', 'Booking', 'Checkout', 'Consultation chat'].map((t) => (
            <span key={t} className="rounded-full border border-slate-400/25 bg-gradient-to-b from-slate-50 to-slate-100/95 px-4 py-2 text-xs font-semibold text-lk-navy shadow-md shadow-slate-900/12 ring-1 ring-slate-300/50 sm:text-sm">
              {t}
            </span>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative overflow-hidden bg-gradient-to-b from-[#E8EEF6] via-[#eef2f8] to-[#dfe8f4] pb-14 pt-10 sm:pb-16 sm:pt-12">
        <div className="relative z-[1] lk-page-wide">
          <Reveal>
          <div className="relative overflow-hidden rounded-2xl border border-[#D8E2F0] bg-gradient-to-br from-[#0B1526] via-[#12355B] to-[#0F172A] px-8 py-12 text-center text-white shadow-[0_28px_70px_-20px_rgba(15,23,42,0.45)] sm:px-12 sm:py-14">
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.07]"
              style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.12) 1px, transparent 1px)', backgroundSize: '24px 24px' }}
            />
            <div className="pointer-events-none absolute left-1/2 top-0 h-40 w-[min(560px,90vw)] -translate-x-1/2 rounded-full bg-amber-400/10 blur-[60px]" />
            <div className="relative z-[1]">
              <h2 className="font-serif text-2xl font-bold tracking-tight sm:text-3xl md:text-[2rem]">Ready to get legal help?</h2>
              <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-white/85 sm:text-base">
                Create your account, find a verified lawyer, and book a consultation — all in one place.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <button
                  type="button"
                  onClick={() => navigate('/lawyers')}
                  className="lk-btn-lift min-h-[48px] rounded-xl bg-lk-accent px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-black/30 ring-2 ring-white/15 transition hover:bg-blue-600 hover:shadow-xl"
                >
                  Find Lawyers
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/register')}
                  className="lk-btn-lift min-h-[48px] rounded-xl border border-white/30 bg-white/12 px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-black/20 backdrop-blur-sm transition hover:bg-white/18"
                >
                  Get started
                </button>
              </div>
            </div>
          </div>
          </Reveal>
        </div>
      </section>

      <Footer />
    </div>
  );
}


function PremiumStatCard({
  icon,
  label,
  value,
  loading,
  highlight,
  hint,
}: {
  icon: ReactNode;
  label: string;
  value: number | string;
  loading?: boolean;
  highlight?: boolean;
  hint?: string;
}) {
  return (
    <div
      className={`lk-card-lift relative overflow-hidden rounded-xl border p-5 shadow-md transition duration-300 hover:border-blue-200/70 sm:p-6 ${
        highlight
          ? 'border-[#D8E2F0] bg-gradient-to-br from-white via-blue-50/80 to-amber-50/20 ring-2 ring-amber-400/25'
          : 'border-[#D8E2F0] bg-gradient-to-br from-white to-blue-50/30 ring-1 ring-slate-200/60'
      }`}
    >
      <div className={`mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl ${highlight ? 'bg-gradient-to-br from-lk-accent to-blue-700 text-white shadow-lg shadow-blue-500/35' : 'bg-gradient-to-br from-blue-100 to-indigo-50 text-lk-accent shadow-inner'} ring-1 ring-slate-200/50`}>
        {icon}
      </div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-lk-muted">{label}</div>
      <div className="mt-2 text-3xl font-bold tabular-nums tracking-tight text-lk-navy">
        {loading ? <span className="inline-block h-9 w-16 animate-pulse rounded-lg bg-slate-200" /> : value}
      </div>
      {hint && !loading ? <p className="mt-3 border-t border-lk-border/80 pt-3 text-xs leading-snug text-lk-muted">{hint}</p> : null}
    </div>
  );
}

function EscrowFlowVisual({ dark }: { dark?: boolean }) {
  const steps = [
    { label: 'Citizen pays', sub: 'Checkout' },
    { label: 'LK wallet', sub: 'Escrow hold' },
    { label: 'Consult done', sub: 'Completion' },
    { label: 'Lawyer payout', sub: 'Release' },
  ];
  const shell = dark
    ? 'rounded-xl border border-white/20 bg-white/[0.08] p-6 shadow-2xl shadow-black/40 backdrop-blur-md ring-1 ring-amber-400/10 sm:p-8'
    : 'rounded-3xl border border-lk-border bg-lk-surface p-6 shadow-lk-card-lg sm:p-8';
  const node =
    dark
      ? 'bg-white/10 text-white ring-1 ring-white/20'
      : 'bg-gradient-to-br from-blue-50 to-slate-50 text-lk-accent ring-1 ring-lk-border';
  const titleC = dark ? 'text-white' : 'text-lk-navy';
  const subC = dark ? 'text-white/65' : 'text-lk-muted';
  const connector = dark ? 'from-white/20 via-lk-accent/50 to-transparent' : 'from-lk-border via-lk-accent/40 to-transparent';
  const footer = dark ? 'border-white/10 text-white/60' : 'border-lk-border text-lk-muted';

  return (
    <div className={shell}>
      <p className={`mb-6 text-center text-[11px] font-semibold uppercase tracking-[0.15em] ${dark ? 'text-white/55' : 'text-lk-muted'}`}>Escrow flow</p>
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-4 sm:gap-3">
        {steps.map((s, i) => (
          <div key={s.label} className="relative text-center">
            {i < steps.length - 1 && (
              <div className={`absolute right-0 top-6 hidden h-px w-[calc(100%-8px)] translate-x-1/2 bg-gradient-to-r ${connector} sm:block`} aria-hidden />
            )}
            <div className={`relative z-[1] mx-auto flex h-12 w-12 items-center justify-center rounded-2xl text-sm font-bold ${node}`}>{i + 1}</div>
            <div className="mt-3">
              <div className={`text-sm font-semibold ${titleC}`}>{s.label}</div>
              <div className={`text-xs ${subC}`}>{s.sub}</div>
            </div>
          </div>
        ))}
      </div>
      <p className={`mt-6 border-t pt-5 text-center text-xs leading-relaxed ${footer}`}>
        Release timing follows the consultation completion rules configured on the platform.
      </p>
    </div>
  );
}
