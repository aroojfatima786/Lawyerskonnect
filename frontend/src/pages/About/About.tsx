import { Link } from 'react-router-dom';
import {
  FaArrowRight,
  FaBalanceScale,
  FaClipboardCheck,
  FaComments,
  FaLock,
  FaShieldAlt,
  FaUserFriends,
} from 'react-icons/fa';
import { Navbar, Footer } from '../../components/layouts';
import { Reveal } from '../../components/public/Reveal';

const principles = [
  {
    icon: FaShieldAlt,
    chip: 'from-slate-800 to-slate-950 text-white ring-slate-700/40',
    title: 'Verification before visibility',
    desc: 'Profiles graduate through admin checkpoints so listings represent reviewed counsel—not anonymous postings.',
  },
  {
    icon: FaComments,
    chip: 'from-blue-600 to-indigo-700 text-white ring-blue-500/30',
    title: 'Secure communication',
    desc: 'Consultations route through platform tooling rather than scattered unofficial channels.',
  },
  {
    icon: FaBalanceScale,
    chip: 'from-emerald-600 to-teal-700 text-white ring-emerald-500/25',
    title: 'Transparent journey',
    desc: 'Fees and milestones appear upfront so expectations align before money moves.',
  },
  {
    icon: FaLock,
    chip: 'from-amber-600 to-orange-700 text-white ring-amber-500/25',
    title: 'Payment accountability',
    desc: 'Checkout ties payouts to completion semantics governed by LawyersKonnect rules—not informal transfers.',
  },
];

export default function About() {
  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-gradient-to-b from-slate-100 via-slate-50 to-slate-100">
      <Navbar />

      <section className="relative overflow-hidden border-b border-slate-200/90 bg-gradient-to-br from-slate-50 via-blue-50/80 to-white py-14 text-lk-navy sm:py-20 lg:py-[5.5rem]">
        <div className="pointer-events-none absolute inset-0 opacity-[0.35]" aria-hidden>
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                'linear-gradient(90deg, rgb(15 23 42 / 0.04) 1px, transparent 1px), linear-gradient(180deg, rgb(15 23 42 / 0.04) 1px, transparent 1px)',
              backgroundSize: '48px 48px',
            }}
          />
        </div>
        <FaBalanceScale className="pointer-events-none absolute -right-4 bottom-4 text-[min(200px,45vw)] text-slate-300/25 sm:right-8 sm:bottom-8" aria-hidden />
        <FaShieldAlt className="pointer-events-none absolute left-[4%] top-[10%] text-[min(100px,22vw)] text-blue-200/40 sm:left-[6%]" aria-hidden />
        <div className="pointer-events-none absolute right-1/4 top-0 h-[min(280px,55vw)] w-[min(280px,55vw)] rounded-full bg-blue-200/30 blur-[90px]" aria-hidden />
        <div className="relative z-[1] lk-page-wide grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-14">
          <div>
            <span
              className="lk-hero-enter mb-4 inline-flex rounded-full border border-slate-200/90 bg-white/90 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-lk-accent shadow-sm ring-1 ring-slate-200/70"
              style={{ animationDelay: '0.06s' }}
            >
              Mission · Trust · Access
            </span>
            <h1
              className="lk-hero-enter max-w-3xl font-serif text-balance text-3xl font-bold leading-[1.12] tracking-tight text-lk-navy sm:text-4xl lg:text-[2.55rem]"
              style={{ animationDelay: '0.12s' }}
            >
              About LawyersKonnect
            </h1>
            <p
              className="lk-hero-enter mt-5 max-w-2xl text-base leading-relaxed text-lk-muted sm:text-lg"
              style={{ animationDelay: '0.2s' }}
            >
              Our mission is to make verified legal help easier to discover and book — with admin-reviewed credentials, transparent fees, and consultations that stay inside an accountable marketplace.
            </p>
            <p className="lk-hero-enter mt-3 max-w-2xl text-sm leading-relaxed text-lk-muted sm:text-base" style={{ animationDelay: '0.28s' }}>
              We do not replace courts or individualized representation; we concentrate verification and booking discipline into one pilot-ready directory experience.
            </p>
            <div className="lk-hero-enter mt-8 flex flex-wrap gap-3" style={{ animationDelay: '0.36s' }}>
              <Link
                to="/lawyers"
                className="lk-btn-lift inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-lk-accent px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-900/20 ring-2 ring-blue-500/20 transition hover:bg-blue-600 hover:shadow-xl"
              >
                Find Lawyers <FaArrowRight className="text-xs" />
              </Link>
              <Link
                to="/services"
                className="lk-btn-lift inline-flex min-h-[48px] items-center gap-2 rounded-xl border border-slate-300/90 bg-white px-6 py-3 text-sm font-semibold text-lk-navy shadow-md shadow-slate-900/8 ring-1 ring-slate-200/80 transition hover:border-blue-200 hover:bg-blue-50/80"
              >
                View Services
              </Link>
              <Link
                to="/#how-it-works"
                className="inline-flex min-h-[48px] items-center gap-2 rounded-xl px-2 py-3 text-sm font-semibold text-lk-accent underline-offset-4 hover:underline"
              >
                How it works
              </Link>
            </div>
          </div>
          <div className="lk-hero-enter-right relative min-w-0 will-change-transform" style={{ animationDelay: '0.14s' }}>
            <AboutTrustFrameworkVisual />
          </div>
        </div>
      </section>

      <div
        className="pointer-events-none h-7 w-full bg-gradient-to-b from-slate-200/90 via-blue-50/70 to-blue-50/95 sm:h-9"
        aria-hidden
      />

      <section className="relative overflow-hidden py-12 sm:py-14 public-section-soft">
        <div className="pointer-events-none absolute -left-20 top-1/3 h-56 w-56 rounded-full bg-blue-200/35 blur-3xl" />
        <div className="pointer-events-none absolute right-10 bottom-10 h-40 w-40 rounded-full bg-indigo-200/30 blur-3xl" />
        <div className="relative lk-page-wide grid gap-10 lg:grid-cols-2 lg:items-center lg:gap-14">
          <Reveal>
          <div>
            <span className="public-kicker">Our story</span>
            <h2 className="lk-section-title mt-2 text-left">Why LawyersKonnect exists</h2>
            <p className="mt-4 text-sm leading-relaxed text-lk-muted sm:text-base">
              Many people stall before ever reaching counsel—unclear categories, unclear pricing, unclear legitimacy. LawyersKonnect concentrates those decisions into a single,
              review-backed marketplace experience suitable for demonstration and pilot deployments.
            </p>
            <p className="mt-4 text-sm leading-relaxed text-lk-muted sm:text-base">
              This is an academic-grade product: careful wording, real API wiring, and explicit separation between general information and formal representation.
            </p>
          </div>
          </Reveal>
          <Reveal variant="right" delayMs={60}>
          <MissionFlowMock />
          </Reveal>
        </div>
      </section>

      <section className="relative overflow-hidden bg-gradient-to-b from-slate-50 via-blue-50/30 to-slate-100 py-12 sm:py-14">
        <div className="pointer-events-none absolute right-1/4 top-10 h-32 w-32 rounded-full bg-blue-300/20 blur-3xl" />
        <div className="relative lk-page-wide">
          <Reveal className="mx-auto mb-10 max-w-2xl text-center lg:mb-12">
            <span className="public-kicker-muted">Trust model</span>
            <h2 className="lk-section-title mt-2 text-center">How we protect marketplace integrity</h2>
            <p className="mt-3 text-sm text-lk-muted sm:text-base">Governance ideas—not a feature checklist duplicated from the homepage.</p>
          </Reveal>
          <div className="grid gap-5 lg:grid-cols-2">
            {principles.map((p, i) => (
              <Reveal key={p.title} delayMs={i * 70}>
              <div
                className="lk-card-lift group relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-white to-blue-50/30 p-6 shadow-xl shadow-slate-300/25 ring-1 ring-slate-100 duration-300 hover:border-blue-200/80 hover:shadow-2xl sm:p-7"
              >
                <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-blue-400/10 blur-2xl transition group-hover:bg-blue-400/15" />
                <div className="flex gap-4">
                  <div
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br shadow-lg ring-2 ring-white transition-transform duration-300 group-hover:scale-105 ${p.chip}`}
                  >
                    <p.icon className="text-lg" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-lk-navy">{p.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-lk-muted">{p.desc}</p>
                  </div>
                </div>
              </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <div className="relative overflow-hidden border-t border-slate-200/90">
        <section className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 pb-14 pt-10 text-white sm:pb-16 sm:pt-12">
        <div className="pointer-events-none absolute left-1/3 top-0 h-56 w-56 rounded-full bg-blue-500/15 blur-3xl" />
        <div className="pointer-events-none absolute right-0 bottom-0 h-48 w-48 rounded-full bg-emerald-500/10 blur-3xl" />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.12) 1px, transparent 1px)', backgroundSize: '24px 24px' }}
        />
        <div className="relative lk-page-wide">
          <Reveal className="mx-auto mb-10 max-w-2xl text-center lg:mb-12">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-white/55">Platform model</span>
            <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">From citizen intent to accountable payout</h2>
            <p className="mt-3 text-sm leading-relaxed text-white/75 sm:text-base">
              A coordinated journey—each milestone keeps responsibility explicit.
            </p>
          </Reveal>
          <Reveal variant="scale" delayMs={40}>
          <PlatformEscrowFlow />
          </Reveal>
        </div>
        </section>
      </div>

      <div className="pointer-events-none h-6 w-full bg-gradient-to-b from-slate-900 via-slate-700/35 to-slate-100 sm:h-8" aria-hidden />

      <section className="relative overflow-hidden border-t border-slate-200/80 bg-gradient-to-b from-slate-100 via-slate-50 to-[#eef2f7] py-12 text-lk-navy sm:py-14">
        <div className="pointer-events-none absolute left-1/2 top-0 h-40 w-[min(560px,90vw)] -translate-x-1/2 rounded-full bg-blue-200/35 blur-[70px]" />
        <div className="relative lk-page-wide text-center">
          <Reveal>
          <h2 className="text-xl font-bold tracking-tight text-lk-navy sm:text-2xl">Explore the marketplace</h2>
          <p className="mx-auto mt-3 max-w-lg text-sm text-lk-muted">
            Capability detail lives on Services; product journeys live on Home.
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
              className="lk-btn-lift inline-flex min-h-[48px] items-center gap-2 rounded-xl border border-slate-300/90 bg-white/90 px-8 py-3 text-sm font-semibold text-lk-navy shadow-md shadow-slate-900/8 ring-1 ring-slate-200/80 backdrop-blur-sm transition hover:border-blue-200 hover:bg-white"
            >
              Get started
            </Link>
          </div>
          </Reveal>
        </div>
      </section>

      <Footer />
    </div>
  );
}

/** About hero only — editorial trust pipeline (distinct from Home marketplace hero). */
function AboutTrustFrameworkVisual() {
  const steps = [
    { title: 'Lawyer profile submitted', sub: 'Structured listing and documents enter the review queue.', icon: <FaUserFriends className="text-lg text-sky-300" /> },
    { title: 'Admin verifies credentials', sub: 'KYC and policy checks before any public visibility.', icon: <FaClipboardCheck className="text-lg text-emerald-300" /> },
    { title: 'Verified profile becomes visible', sub: 'Review-first listing appears in directory search.', icon: <FaShieldAlt className="text-lg text-blue-200" /> },
    { title: 'Citizen books with confidence', sub: 'Booking and messaging follow marketplace rules.', icon: <FaBalanceScale className="text-lg text-amber-300" /> },
  ];
  return (
    <div className="relative mx-auto max-w-lg lg:max-w-none">
      <div className="pointer-events-none absolute -right-6 -top-8 h-32 w-32 rounded-full bg-blue-400/25 blur-3xl" aria-hidden />
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-lk-navy via-[#12355B] to-[#1e3a8f] p-5 shadow-xl shadow-lk-navy/35 ring-1 ring-white/10 sm:p-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-blue-200/80">Trust framework</p>
        <p className="mt-1 font-serif text-lg font-semibold text-white">From intake to verified booking</p>
        <ol className="mt-5 space-y-3">
          {steps.map((s, i) => (
            <li
              key={s.title}
              className="rounded-xl border border-white/12 bg-white/[0.08] p-4 shadow-md shadow-black/15 ring-1 ring-white/10 backdrop-blur-sm"
            >
              <Reveal delayMs={i * 70}>
                <div className="flex gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/10 font-serif text-sm font-bold text-white shadow-inner">
                    {i + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {s.icon}
                      <span className="text-sm font-semibold text-white">{s.title}</span>
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-white/65">{s.sub}</p>
                  </div>
                </div>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function MissionFlowMock() {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-white to-blue-50/35 p-6 shadow-2xl shadow-slate-300/30 ring-1 ring-slate-100 sm:p-8">
      <div className="pointer-events-none absolute -right-6 -top-6 h-28 w-28 rounded-full bg-blue-400/15 blur-2xl" />
      <p className="relative text-[11px] font-semibold uppercase tracking-wide text-lk-muted">Citizen → verified lawyer → consultation</p>
      <div className="relative mt-6 flex flex-col items-stretch gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col items-center rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 px-4 py-5 text-center shadow-md ring-1 ring-slate-100">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-lk-accent to-blue-700 text-sm font-bold text-white shadow-lg">C</div>
          <p className="mt-2 text-xs font-semibold text-lk-navy">Citizen need</p>
          <p className="mt-1 text-[11px] text-lk-muted">Issue captured</p>
        </div>
        <div className="hidden shrink-0 text-lk-muted sm:block">→</div>
        <div className="flex flex-1 flex-col items-center rounded-2xl border border-emerald-200/90 bg-gradient-to-br from-emerald-50 to-white px-4 py-5 text-center shadow-md ring-1 ring-emerald-100">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white shadow-md">V</div>
          <p className="mt-2 text-xs font-semibold text-emerald-950">Verified lawyer</p>
          <p className="mt-1 text-[11px] text-emerald-900/80">Reviewed profile</p>
        </div>
        <div className="hidden shrink-0 text-lk-muted sm:block">→</div>
        <div className="flex flex-1 flex-col items-center rounded-2xl border border-slate-700 bg-gradient-to-br from-lk-navy to-slate-900 px-4 py-5 text-center text-white shadow-lg ring-1 ring-white/10">
          <FaComments className="text-xl opacity-90" />
          <p className="mt-2 text-xs font-semibold">Consultation</p>
          <p className="mt-1 text-[11px] text-white/70">Booking-aware session</p>
        </div>
      </div>
    </div>
  );
}

function PlatformEscrowFlow() {
  const steps = [
    { icon: FaUserFriends, title: 'Citizen', sub: 'Books through marketplace flows' },
    { icon: FaBalanceScale, title: 'Verified lawyer', sub: 'Review-backed listing' },
    { icon: FaClipboardCheck, title: 'Admin review', sub: 'Verification & policy gates' },
    { icon: FaLock, title: 'Escrow payment', sub: 'Held until completion rules' },
  ];

  return (
    <div className="rounded-lg border border-white/15 bg-white/[0.06] p-6 shadow-xl shadow-black/20 backdrop-blur-md ring-1 ring-white/10 sm:p-8">
      <div className="grid gap-6 md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] md:items-start">
        {steps.map((s, i) => (
          <div key={s.title} className="contents">
            <div className="rounded-md border border-white/15 bg-white/[0.08] p-5 text-center shadow-md shadow-black/15 md:text-left">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 md:mx-0">
                <s.icon className="text-xl text-blue-200" />
              </div>
              <h3 className="mt-4 text-sm font-bold text-white sm:text-base">{s.title}</h3>
              <p className="mt-2 text-xs leading-relaxed text-white/65">{s.sub}</p>
            </div>
            {i < steps.length - 1 ? (
              <div className="hidden items-center justify-center md:flex" aria-hidden>
                <div className="h-px w-10 bg-gradient-to-r from-white/40 to-white/10 sm:w-12" />
                <FaArrowRight className="mx-1 text-[10px] text-white/45" />
                <div className="h-px w-10 bg-gradient-to-l from-white/40 to-white/10 sm:w-12" />
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <p className="mt-8 border-t border-white/10 pt-6 text-center text-xs leading-relaxed text-white/55">
        Admin tooling coordinates verification; escrow semantics follow the platform&apos;s configured completion milestones—not informal transfers.
      </p>
    </div>
  );
}
