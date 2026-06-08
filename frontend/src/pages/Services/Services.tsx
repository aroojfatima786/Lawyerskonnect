import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  FaCalendarCheck,
  FaCreditCard,
  FaStar,
  FaArrowRight,
  FaUserFriends,
  FaQuestionCircle,
  FaBalanceScale,
  FaUserCheck,
  FaComments,
  FaSearch,
  FaChevronRight,
} from 'react-icons/fa';
import { Navbar, Footer } from '../../components/layouts';
import { Reveal } from '../../components/public/Reveal';
import { PortalChrome } from '../../components/ui/PortalChrome';

const journey = [
  { label: 'Discover', sub: 'Search & intake' },
  { label: 'Match', sub: 'Review-backed listings' },
  { label: 'Book', sub: 'Slot handshake' },
  { label: 'Pay', sub: 'Platform checkout' },
  { label: 'Consult', sub: 'Chat / session' },
  { label: 'Review', sub: 'Post-consult feedback' },
];

const CARD_THEMES = [
  {
    shell: 'from-white via-sky-50/90 to-blue-100/50',
    orb: 'bg-sky-400/25',
    icon: 'from-sky-500 to-[#12355B] shadow-sky-500/40',
    stripe: 'border-l-lk-accent',
    ring: 'ring-sky-200/60',
  },
  {
    shell: 'from-white via-indigo-50/80 to-violet-100/40',
    orb: 'bg-indigo-400/20',
    icon: 'from-indigo-500 to-[#312e81] shadow-indigo-500/35',
    stripe: 'border-l-indigo-500',
    ring: 'ring-indigo-200/50',
  },
  {
    shell: 'from-white via-emerald-50/70 to-teal-50/40',
    orb: 'bg-emerald-400/20',
    icon: 'from-emerald-500 to-teal-700 shadow-emerald-500/35',
    stripe: 'border-l-emerald-500',
    ring: 'ring-emerald-200/50',
  },
  {
    shell: 'from-white via-cyan-50/80 to-blue-50/50',
    orb: 'bg-cyan-400/22',
    icon: 'from-cyan-500 to-blue-700 shadow-cyan-500/35',
    stripe: 'border-l-cyan-600',
    ring: 'ring-cyan-200/50',
  },
  {
    shell: 'from-white via-amber-50/80 to-orange-50/35',
    orb: 'bg-amber-400/22',
    icon: 'from-amber-500 to-orange-600 shadow-amber-500/35',
    stripe: 'border-l-amber-500',
    ring: 'ring-amber-200/55',
  },
  {
    shell: 'from-white via-rose-50/60 to-amber-50/40',
    orb: 'bg-rose-300/18',
    icon: 'from-amber-500 to-rose-500 shadow-amber-500/30',
    stripe: 'border-l-amber-500',
    ring: 'ring-amber-200/45',
  },
] as const;

const features: Array<{
  title: string;
  bullets: string[];
  visual: ReactNode;
  icon: ReactNode;
  cta?: { to: string; label: string };
}> = [
  {
    title: 'Lawyer discovery',
    icon: <FaSearch className="text-lg" />,
    bullets: ['Filter by practice area, city, and listing signals.', 'Compare consultation fees before requesting time.', 'Open full profiles from search results.'],
    visual: <FeatureVisualDiscovery />,
    cta: { to: '/lawyers', label: 'Open directory' },
  },
  {
    title: 'Appointment booking',
    icon: <FaCalendarCheck className="text-lg" />,
    bullets: ['Request availability that fits both schedules.', 'Stay inside one timeline through confirmation.', 'Unlock messaging rules tied to booking state.'],
    visual: <FeatureVisualCalendar />,
  },
  {
    title: 'Secure consultation chat',
    icon: <FaComments className="text-lg" />,
    bullets: ['Reduce leakage to unmanaged channels.', 'Keep consultation context adjacent to the booking record.', 'Purpose-built for marketplace accountabilityâ€”not casual social chat.'],
    visual: <FeatureVisualChat />,
  },
  {
    title: 'Escrow-style checkout',
    icon: <FaCreditCard className="text-lg" />,
    bullets: ['Fees route through LawyersKonnect flows.', 'Release semantics follow configured completion rules.', 'Citizens see milestones instead of informal transfers.'],
    visual: <FeatureVisualEscrow />,
  },
  {
    title: 'Reviews & ratings',
    icon: <FaStar className="text-lg" />,
    bullets: ['Signals emerge from completed consultations.', 'Helps future visitors compare counsel realistically.', 'Keeps reputation adjacent to real engagements.'],
    visual: <FeatureVisualReviews />,
  },
];

export default function Services() {
  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-gradient-to-b from-slate-100 via-slate-50 to-slate-100">
      <Navbar />

      <section className="relative overflow-hidden py-14 text-white sm:py-16 lg:py-[5.25rem]">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#0F172A] via-[#12355B] to-[#1E3A8A]" aria-hidden />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.45]"
          style={{
            backgroundImage:
              'linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
          aria-hidden
        />
        <div className="pointer-events-none absolute bottom-0 right-0 h-72 w-72 rounded-full bg-blue-600/20 blur-[100px]" aria-hidden />
        <div className="pointer-events-none absolute left-0 top-0 h-56 w-56 rounded-full bg-indigo-500/20 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute right-[12%] top-[12%] h-[min(200px,40vw)] w-[min(200px,40vw)] rounded-full bg-cyan-400/10 blur-[70px]" aria-hidden />
        <div className="relative z-[1] lk-page-wide flex flex-col gap-12 lg:grid lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:gap-10">
          <div className="min-w-0">
            <span
              className="lk-hero-enter mb-4 inline-flex rounded-full border border-cyan-400/30 bg-white/10 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-100/95 ring-1 ring-white/15"
              style={{ animationDelay: '0.04s' }}
            >
              Platform services
            </span>
            <h1
              className="lk-hero-enter max-w-3xl text-balance font-serif text-3xl font-bold leading-[1.12] tracking-tight text-white sm:text-4xl lg:text-[2.5rem]"
              style={{ animationDelay: '0.1s' }}
            >
              Services built around the legal consultation journey
            </h1>
            <p
              className="lk-hero-enter mt-5 max-w-2xl text-base leading-relaxed text-white/85 sm:text-lg"
              style={{ animationDelay: '0.18s' }}
            >
              Discovery, booking, escrow checkout, secure consultation chat, and post-consult reviewsâ€”each capability maps to a stage in one coordinated journey, not a pile
              of disconnected widgets.
            </p>
            <div className="lk-hero-enter mt-8 flex flex-wrap gap-3" style={{ animationDelay: '0.26s' }}>
              <Link
                to="/services#services-capabilities"
                className="lk-btn-lift inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-lk-accent px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-950/40 ring-2 ring-white/15 transition hover:bg-blue-600 hover:shadow-xl"
              >
                Explore Services
                <FaArrowRight className="text-xs" />
              </Link>
              <Link
                to="/lawyers"
                className="lk-btn-lift inline-flex min-h-[48px] items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-black/15 ring-1 ring-white/20 backdrop-blur-sm transition hover:bg-white/18"
              >
                Find Lawyers
              </Link>
            </div>
          </div>
          <div className="lk-hero-enter-right relative min-w-0 will-change-transform lg:max-w-none" style={{ animationDelay: '0.12s' }}>
            <ServicesHeroJourneyVisual />
          </div>
        </div>
      </section>

      <div
        className="pointer-events-none h-8 w-full bg-gradient-to-b from-[#0f172a] via-[#1e3a8a]/40 to-blue-50/95 sm:h-10"
        aria-hidden
      />

      {/* Journey */}
      <section id="services-capabilities" className="relative overflow-hidden bg-gradient-to-b from-blue-50/90 via-slate-50 to-slate-100 py-12 sm:py-14">
        <div className="pointer-events-none absolute right-10 top-8 h-40 w-40 rounded-full bg-blue-300/25 blur-3xl" />
        <div className="pointer-events-none absolute left-10 bottom-8 h-36 w-36 rounded-full bg-indigo-200/30 blur-3xl" />
        <div className="relative z-[1] lk-page-wide">
          <Reveal className="mx-auto mb-10 max-w-2xl text-center">
            <span className="public-kicker">End-to-end</span>
            <h2 className="lk-section-title mt-2 text-center">The journey we optimize</h2>
            <p className="mt-3 text-sm text-lk-muted sm:text-base">Discover â†’ Match â†’ Book â†’ Pay â†’ Consult â†’ Review â€” implementation detail varies by deployment.</p>
          </Reveal>
          <div className="relative overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="relative flex min-w-[640px] items-start justify-between gap-2 px-2 sm:min-w-0">
              <div className="pointer-events-none absolute left-8 right-8 top-[22px] hidden h-[3px] rounded-full bg-gradient-to-r from-transparent via-lk-accent/45 to-transparent shadow-[0_0_12px_rgba(37,99,235,0.2)] sm:block" />
              {journey.map((j, i) => (
                <Reveal key={j.label} delayMs={i * 55} className="relative z-[1] flex flex-1 flex-col items-center text-center">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-lk-accent to-[#12355B] text-xs font-bold text-white shadow-lg shadow-slate-300/40 ring-2 ring-amber-400/20">{i + 1}</div>
                  <p className="mt-3 text-xs font-semibold text-lk-navy sm:text-sm">{j.label}</p>
                  <p className="text-[11px] text-lk-muted">{j.sub}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Capability cards â€” premium layered layout */}
      <section className="relative overflow-hidden border-t border-slate-300/50 bg-[#dfe6f0] py-12 sm:py-16">
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              'linear-gradient(90deg, rgba(15,39,70,0.05) 1px, transparent 1px), linear-gradient(rgba(15,39,70,0.05) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
          aria-hidden
        />
        <div className="relative z-[1] space-y-10 sm:space-y-14">
          {features.map((f, idx) => {
            const textFromLeft = idx % 2 === 0;
            const theme = CARD_THEMES[idx % CARD_THEMES.length];
            return (
              <div key={f.title} className="relative">
                <div className="relative lk-page-wide">
                  <ServiceCapabilityCard theme={theme}>
                    <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-12">
                      <Reveal
                        variant={textFromLeft ? 'left' : 'right'}
                        delayMs={60 + idx * 30}
                        className={`relative min-w-0 ${idx % 2 === 1 ? 'lg:order-2' : ''}`}
                      >
                        <span
                          className="inline-block bg-gradient-to-br from-[#0f2746] via-[#1e3a8f] to-[#3b5bdb] bg-clip-text font-serif text-5xl font-bold leading-none text-transparent sm:text-6xl"
                          aria-hidden
                        >
                          {String(idx + 1).padStart(2, '0')}
                        </span>
                        <div className="mt-3">
                          <div className="flex flex-wrap items-start gap-4">
                            <div
                              className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${theme.icon} text-white shadow-lg ring-4 ring-white/90`}
                            >
                              {f.icon}
                            </div>
                            <div className="min-w-0 pt-1">
                              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-lk-muted">Capability</span>
                              <h3 className="mt-1 text-left text-xl font-bold text-lk-navy sm:text-2xl">{f.title}</h3>
                            </div>
                          </div>
                          <ul className="mt-7 space-y-3.5">
                            {f.bullets.map((b) => (
                              <li key={b} className="flex gap-3 text-sm leading-relaxed text-slate-600">
                                <span className={`mt-2 h-2 w-2 shrink-0 rounded-full bg-gradient-to-br ${theme.icon}`} />
                                {b}
                              </li>
                            ))}
                          </ul>
                          {f.cta ? (
                            <Link
                              to={f.cta.to}
                              className={`lk-btn-lift mt-8 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r ${theme.icon} px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:brightness-110`}
                            >
                              {f.cta.label}
                              <FaArrowRight className="text-xs" />
                            </Link>
                          ) : null}
                        </div>
                      </Reveal>
                      <Reveal
                        variant={textFromLeft ? 'right' : 'left'}
                        delayMs={120 + idx * 30}
                        className={`min-w-0 ${idx % 2 === 1 ? 'lg:order-1' : ''}`}
                      >
                        <div className="lg:py-2">{f.visual}</div>
                      </Reveal>
                    </div>
                  </ServiceCapabilityCard>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Who â€” flat transition from light features */}
      <div className="relative overflow-hidden border-t border-slate-200/80">
        <section className="relative overflow-hidden bg-gradient-to-br from-lk-navy via-[#141f38] to-slate-900 py-12 text-white sm:py-14">
        <div className="lk-page-wide">
          <Reveal className="text-center">
          <h2 className="text-xl font-bold sm:text-2xl">Who this journey fits</h2>
          </Reveal>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            <Reveal delayMs={0}>
            <WhoStrip icon={<FaUserFriends className="text-lg" />} title="First-time legal questions" desc="You need orientation before committing to counsel." />
            </Reveal>
            <Reveal delayMs={70}>
            <WhoStrip icon={<FaQuestionCircle className="text-lg" />} title="Unclear category fit" desc="You want help narrowing practice areas before filtering." />
            </Reveal>
            <Reveal delayMs={140}>
            <WhoStrip icon={<FaBalanceScale className="text-lg" />} title="Counsel shoppers" desc="You prefer comparing verified listings instead of cold outreach." />
            </Reveal>
          </div>
        </div>
        </section>
      </div>

      <section className="relative overflow-hidden border-t border-slate-200/80 bg-gradient-to-b from-slate-100 via-slate-50 to-[#eef2f7] py-14 text-lk-navy sm:py-16 md:py-20">
        <div className="pointer-events-none absolute left-1/2 top-0 h-44 w-[min(520px,92vw)] -translate-x-1/2 rounded-full bg-blue-200/40 blur-[60px]" />
        <div className="relative lk-page-wide text-center">
          <Reveal>
          <div className="relative overflow-hidden rounded-xl border border-slate-200/90 bg-white/90 px-8 py-12 shadow-lg shadow-slate-900/10 ring-1 ring-slate-200/70 backdrop-blur-sm sm:px-12 sm:py-14 md:py-16">
            <h2 className="font-serif text-2xl font-bold text-lk-navy sm:text-3xl">Find a verified lawyer on LawyersKonnect</h2>
            <p className="mx-auto mt-3 max-w-lg text-sm text-lk-muted sm:text-base">
              Search the directory, book a consultation, and pay through platform escrow â€” all in one place.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link
                to="/lawyers"
                className="lk-btn-lift inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-lk-accent px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-900/20 ring-2 ring-blue-500/25 transition hover:bg-blue-600 hover:shadow-xl"
              >
                Find Lawyers <FaArrowRight className="text-xs" />
              </Link>
              <Link
                to="/register"
                className="lk-btn-lift inline-flex min-h-[48px] items-center gap-2 rounded-xl border border-slate-300/90 bg-white px-8 py-3 text-sm font-semibold text-lk-navy shadow-md shadow-slate-900/8 ring-1 ring-slate-200/80 transition hover:border-blue-200 hover:bg-slate-50"
              >
                Get started
              </Link>
            </div>
          </div>
          </Reveal>
        </div>
      </section>

      <Footer />
    </div>
  );
}

/** Services hero â€” journey spine + capability panels (distinct from Home & About). */
function ServicesHeroJourneyVisual() {
  const nodeIcons = [FaSearch, FaUserCheck, FaCalendarCheck, FaCreditCard, FaComments, FaStar] as const;
  const panels = [
    { title: 'Lawyer discovery', sub: 'Search, filters, verified rows', icon: <FaSearch className="text-lk-accent" /> },
    { title: 'Appointment booking', sub: 'Request â†’ confirm â†’ timeline', icon: <FaCalendarCheck className="text-lk-accent" /> },
    { title: 'Escrow payment', sub: 'Checkout Â· hold Â· release rules', icon: <FaCreditCard className="text-lk-accent" /> },
    { title: 'Secure chat', sub: 'Booking-linked consultation thread', icon: <FaComments className="text-lk-accent" /> },
  ];
  return (
    <div className="relative mx-auto w-full max-w-xl lg:mx-0 lg:max-w-none">
      <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xl shadow-slate-900/10 ring-1 ring-slate-100 sm:p-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-lk-accent">Service journey</p>
        <p className="mt-0.5 text-xs text-lk-muted">Discover â†’ Match â†’ Book â†’ Pay â†’ Consult â†’ Review</p>

        <div className="mt-5 flex flex-col gap-0 sm:flex-row sm:items-stretch sm:gap-4">
          <div className="relative flex flex-1 flex-col sm:max-w-[200px]">
            <div className="absolute left-[18px] top-2 bottom-2 w-px bg-gradient-to-b from-lk-accent/35 via-slate-200 to-slate-100 sm:left-5" aria-hidden />
            <ol className="relative space-y-3">
              {journey.map((j, i) => {
                const Icon = nodeIcons[i] ?? FaChevronRight;
                return (
                  <li key={j.label} className="flex items-start gap-3 pl-1 sm:pl-0">
                    <div className="relative z-[1] flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-gradient-to-br from-lk-accent to-[#12355B] text-[10px] font-bold text-white shadow-md ring-2 ring-amber-400/15">
                      <Icon className="text-[11px] opacity-95" />
                    </div>
                    <div className="min-w-0 pt-0.5">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-lk-navy">{j.label}</p>
                      <p className="text-[10px] text-lk-muted">{j.sub}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="mt-6 min-h-px flex-1 border-t border-slate-100 pt-5 sm:mt-0 sm:border-l sm:border-t-0 sm:border-slate-100 sm:pl-5 sm:pt-0">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-lk-muted">Capability panels</p>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {panels.map((p) => (
                <div
                  key={p.title}
                  className="rounded-xl border-2 border-[#b8c9e8]/90 bg-slate-50/80 px-3 py-2.5 ring-1 ring-[#1e3a8f]/15"
                >
                  <div className="flex items-center gap-2 text-lk-navy">
                    {p.icon}
                    <span className="text-[11px] font-semibold">{p.title}</span>
                  </div>
                  <p className="mt-1 text-[10px] leading-snug text-lk-muted">{p.sub}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


function ServiceCapabilityCard({ theme, children }: { theme: (typeof CARD_THEMES)[number]; children: ReactNode }) {
  return (
    <div className="group relative">
      <div className={`pointer-events-none absolute -right-8 top-4 h-40 w-40 rounded-full blur-3xl opacity-60 ${theme.orb}`} aria-hidden />
      <div
        className={`relative overflow-hidden rounded-3xl border border-slate-200/90 bg-white shadow-[0_16px_48px_-20px_rgba(15,23,42,0.28)] ring-1 ${theme.ring} transition duration-300 motion-safe:hover:-translate-y-1 motion-safe:hover:shadow-[0_24px_56px_-18px_rgba(15,23,42,0.32)]`}
      >
        <div className={`h-1 bg-gradient-to-r ${theme.icon}`} aria-hidden />
        <div className="relative p-6 sm:p-8 lg:p-10">{children}</div>
      </div>
    </div>
  );
}

function WhoStrip({ icon, title, desc }: { icon: ReactNode; title: string; desc: string }) {
  return (
    <div className="lk-card-lift rounded-2xl border border-white/15 bg-white/10 p-6 shadow-lg shadow-black/15 backdrop-blur-sm ring-1 ring-white/12 duration-300 hover:border-blue-200/30">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">{icon}</div>
      <h3 className="mt-4 font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-white/72">{desc}</p>
    </div>
  );
}


function FeatureVisualDiscovery() {
  const rows = [
    { name: 'Adv. Sara Khan', area: 'Family Law', city: 'Lahore', fee: 'PKR 3,500', rating: '4.9', initial: 'K' },
    { name: 'Adv. Ali Hassan', area: 'Immigration', city: 'Islamabad', fee: 'PKR 4,200', rating: '4.7', initial: 'H' },
  ];
  return (
    <div className="rounded-2xl border border-sky-200/70 bg-gradient-to-br from-sky-50 via-white to-indigo-50/80 p-4 shadow-[0_20px_40px_-16px_rgba(37,99,235,0.25)] ring-1 ring-sky-200/50">
      <PortalChrome label="Directory search">
        <div className="flex flex-wrap gap-2">
          <span className="rounded-lg bg-[#1e3a8f]/10 px-2.5 py-1 text-[10px] font-semibold text-[#1e3a8f]">Family Law</span>
          <span className="rounded-lg bg-[#1e3a8f]/10 px-2.5 py-1 text-[10px] font-semibold text-[#1e3a8f]">Lahore</span>
          <span className="rounded-lg border border-dashed border-slate-200 px-2.5 py-1 text-[10px] text-lk-muted">Fee range</span>
        </div>
        <div className="mt-3 space-y-2">
          {rows.map((r) => (
            <div key={r.name} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#12355B] to-[#1e3a8f] text-[10px] font-bold text-white">
                {r.initial}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-lk-navy">{r.name}</p>
                <p className="text-[10px] text-lk-muted">
                  {r.area} Â· {r.city} Â· {r.fee}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="flex items-center justify-end gap-0.5 text-[10px] font-semibold text-amber-600">
                  <FaStar className="text-[9px]" /> {r.rating}
                </p>
                <span className="text-[10px] font-semibold text-[#1e3a8f]">View profile</span>
              </div>
            </div>
          ))}
        </div>
      </PortalChrome>
    </div>
  );
}

function FeatureVisualCalendar() {
  const steps = [
    { label: 'Requested', done: true },
    { label: 'Confirmed', done: true },
    { label: 'Paid', done: false, pct: '40%' },
  ];
  return (
    <div className="rounded-2xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50 via-white to-teal-50/70 p-4 shadow-[0_20px_40px_-16px_rgba(16,185,129,0.2)] ring-1 ring-emerald-200/50">
      <PortalChrome label="Appointment · LK-2841">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-lk-navy">Adv. Sara Khan</p>
            <p className="text-[10px] text-lk-muted">28 Apr 2026 · 3:00–3:45 PM</p>
            <p className="text-[10px] text-lk-muted">Video · Family Law</p>
          </div>
          <FaCalendarCheck className="text-xl text-emerald-600 opacity-80" />
        </div>
        <div className="mt-3 rounded-xl border border-emerald-100 bg-white/80 p-3">
          <div className="flex flex-wrap gap-2">
            {steps.map((st) => (
              <span
                key={st.label}
                className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${st.done ? 'bg-gradient-to-r from-[#12355B] to-[#1e3a8f] text-white' : 'border border-slate-200 bg-slate-50 text-lk-muted'}`}
              >
                {st.label}
                {!st.done ? ' · pending' : ' ✓'}
              </span>
            ))}
          </div>
          <div className="mt-3 flex gap-1">
            {steps.map((st) => (
              <div key={st.label} className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#12355B] to-[#1e3a8f]"
                  style={{ width: st.done ? '100%' : st.pct ?? '0%' }}
                />
              </div>
            ))}
          </div>
        </div>
      </PortalChrome>
    </div>
  );
}

function FeatureVisualChat() {
  return (
    <div className="rounded-2xl border border-cyan-200/70 bg-gradient-to-br from-cyan-50 via-white to-blue-50/70 p-4 shadow-[0_20px_40px_-16px_rgba(6,182,212,0.2)] ring-1 ring-cyan-200/50">
      <PortalChrome label="Consultation Â· Booking LK-2841">
        <div className="space-y-2">
          <div className="max-w-[88%] rounded-xl rounded-bl-sm border border-slate-100 bg-slate-50 px-3 py-2">
            <p className="text-[9px] font-semibold text-lk-muted">Adv. Sara Khan Â· 2:31 PM</p>
            <p className="mt-0.5 text-[11px] text-lk-navy">Please upload the signed lease and deposit receipt before we meet.</p>
          </div>
          <div className="ml-auto max-w-[82%] rounded-xl rounded-br-sm bg-gradient-to-r from-[#12355B] to-[#1e3a8f] px-3 py-2 text-white shadow-md">
            <p className="text-[9px] font-medium text-white/75">You Â· 2:34 PM</p>
            <p className="mt-0.5 text-[11px]">Attached both files â€” ready for the call.</p>
          </div>
        </div>
        <p className="mt-2 text-center text-[9px] text-lk-muted">End-to-end encrypted Â· tied to paid booking</p>
      </PortalChrome>
    </div>
  );
}

function FeatureVisualEscrow() {
  return (
    <div className="rounded-2xl border border-amber-200/70 bg-gradient-to-br from-amber-50 via-white to-orange-50/60 p-4 shadow-[0_20px_40px_-16px_rgba(245,158,11,0.22)] ring-1 ring-amber-200/50">
      <PortalChrome label="Escrow checkout">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase text-lk-muted">Consultation fee</p>
            <p className="text-lg font-bold tabular-nums text-lk-navy">PKR 3,500</p>
          </div>
          <FaCreditCard className="text-2xl text-[#1e3a8f] opacity-80" />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5 text-[10px] font-semibold">
          <span className="rounded-full bg-[#1e3a8f] px-2.5 py-1 text-white">Checkout âœ“</span>
          <FaArrowRight className="text-[9px] text-lk-muted" />
          <span className="rounded-full bg-amber-500 px-2.5 py-1 text-white">In hold</span>
          <FaArrowRight className="text-[9px] text-lk-muted" />
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-900">Release on complete</span>
        </div>
        <p className="mt-2 text-center text-[10px] text-lk-muted">Visa Â·Â·Â·Â· 4242 Â· Receipt #PAY-9F2A</p>
      </PortalChrome>
    </div>
  );
}

function FeatureVisualReviews() {
  return (
    <div className="rounded-2xl border border-rose-200/60 bg-gradient-to-br from-rose-50/80 via-white to-amber-50/50 p-4 shadow-[0_20px_40px_-16px_rgba(244,63,94,0.18)] ring-1 ring-rose-200/45">
      <PortalChrome label="Post-consult review">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-sm font-bold text-white">
            SK
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-lk-navy">Adv. Sara Khan</p>
            <p className="text-[10px] text-lk-muted">Family Law Â· Consult completed 28 Apr 2026</p>
            <div className="mt-1 flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((i) => (
                <FaStar key={i} className="text-amber-500" size={11} />
              ))}
              <span className="ml-1 text-xs font-bold text-lk-navy">5.0</span>
            </div>
          </div>
        </div>
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-lk-navy">
          &ldquo;Clear on fees, documents, and next steps. Would book again for tenancy issues.&rdquo;
        </p>
        <p className="mt-2 text-[10px] text-lk-muted">Verified Â· linked to appointment LK-2841</p>
      </PortalChrome>
    </div>
  );
}
