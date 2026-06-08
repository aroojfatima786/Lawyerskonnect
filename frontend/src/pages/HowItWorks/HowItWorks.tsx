import { Link } from 'react-router-dom';
import {
  FaSearch,
  FaUserCheck,
  FaCalendarCheck,
  FaLock,
  FaComments,
  FaArrowRight,
  FaShieldAlt,
  FaCheckCircle,
} from 'react-icons/fa';
import { FiCpu } from 'react-icons/fi';
import { Navbar, Footer } from '../../components/layouts';

const steps = [
  {
    n: 1,
    title: 'Find your lawyer',
    body: 'Search verified lawyers by practice area, city, rating, and consultation fee from the public directory.',
    icon: <FaSearch className="text-2xl text-lk-accent" />,
    bullets: ['Practice area filters', 'Transparent fees', 'Verified profile badges'],
  },
  {
    n: 2,
    title: 'Get matched with verified lawyers',
    body: 'Every listed lawyer passes admin-reviewed KYC. Compare profiles, reviews, and transparent fees before you book.',
    icon: <FaUserCheck className="text-2xl text-lk-accent" />,
    bullets: ['Verified badges', 'Public ratings', 'Clear consultation pricing'],
  },
  {
    n: 3,
    title: 'Book and pay securely',
    body: 'Request an appointment slot. Once confirmed, pay through LawyersKonnect — your fee is held in escrow until completion.',
    icon: <FaCalendarCheck className="text-2xl text-lk-accent" />,
    bullets: ['Confirmed bookings', 'Escrow wallet', 'Multiple payment rails where configured'],
  },
  {
    n: 4,
    title: 'Consult through secure chat',
    body: 'After payment rules are satisfied, collaborate with your lawyer via on-platform messaging and scheduled sessions.',
    icon: <FaComments className="text-2xl text-lk-accent" />,
    bullets: ['Policy-aware chat', 'Consultation milestones', 'Reviews after completion'],
  },
];

export default function HowItWorks() {
  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-lk-canvas">
      <Navbar />

      <section className="relative overflow-hidden bg-gradient-to-br from-lk-navy via-[#0c1e3d] to-slate-900 py-14 text-white sm:py-16 lg:py-20">
        <div className="pointer-events-none absolute right-0 top-0 h-64 w-64 rounded-full bg-lk-accent/15 blur-3xl" />
        <div className="relative lk-page-wide px-5">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide ring-1 ring-white/20">
            <FaShieldAlt className="text-lk-success" /> LawyersKonnect workflow
          </p>
          <h1 className="max-w-3xl text-balance text-3xl font-bold tracking-tight sm:text-4xl lg:text-[2.5rem]">
            Get legal help in four simple steps
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/85 sm:text-lg">
            From first question to consultation — discovery, verification, escrow, and secure collaboration in one trusted marketplace.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/lawyers"
              className="inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-lk-accent px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-black/30 transition hover:bg-blue-600"
            >
              Find Lawyers <FaArrowRight className="text-xs" />
            </Link>
            <Link
              to="/register"
              className="inline-flex min-h-[48px] items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-6 py-3 text-sm font-semibold backdrop-blur transition hover:bg-white/15"
            >
              Get started
            </Link>
          </div>
        </div>
      </section>

      <section className="py-14 sm:py-16">
        <div className="lk-page-wide space-y-16 px-5">
          {steps.map((step, idx) => (
            <div key={step.n} className="grid gap-10 lg:grid-cols-2 lg:items-center lg:gap-16">
              <div className={`relative ${idx % 2 === 1 ? 'lg:order-2' : ''}`}>
                <div className="absolute -left-4 top-8 hidden h-[calc(100%+2rem)] w-px bg-gradient-to-b from-lk-accent/40 to-lk-border lg:block" aria-hidden />
                <div className="relative rounded-3xl border border-lk-border bg-lk-surface p-8 shadow-lk-card-lg">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-50 to-slate-50 ring-1 ring-lk-border">{step.icon}</div>
                  <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-lk-canvas px-3 py-1 text-xs font-bold text-lk-accent ring-1 ring-lk-border">
                    Step {step.n}
                  </div>
                  <h2 className="lk-section-title mt-4 text-left">{step.title}</h2>
                  <p className="mt-3 text-sm leading-relaxed text-lk-muted sm:text-base">{step.body}</p>
                  <ul className="mt-6 space-y-2">
                    {step.bullets.map((b) => (
                      <li key={b} className="flex gap-2 text-sm text-lk-navy">
                        <FaCheckCircle className="mt-0.5 shrink-0 text-lk-success" />
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className={`min-w-0 ${idx % 2 === 1 ? 'lg:order-1' : ''}`}>
                <StepVisual index={idx} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-lk-border bg-lk-surface py-14 sm:py-16">
        <div className="lk-page-wide grid gap-10 px-5 lg:grid-cols-2 lg:items-start">
          <div className="rounded-3xl border border-lk-border bg-gradient-to-br from-emerald-50/80 to-white p-8 shadow-lk-card-lg">
            <FaLock className="text-2xl text-lk-success" />
            <h3 className="lk-section-title mt-4 text-left">Escrow in plain terms</h3>
            <p className="mt-3 text-sm leading-relaxed text-lk-muted sm:text-base">
              Your consultation payment is held by LawyersKonnect and released to the lawyer after the consultation is completed according to platform rules.
              This reduces friction and aligns incentives for both sides.
            </p>
          </div>
          <div className="rounded-3xl border border-lk-border bg-gradient-to-br from-blue-50/80 to-white p-8 shadow-lk-card-lg">
            <FiCpu className="text-2xl text-lk-accent" />
            <h3 className="lk-section-title mt-4 text-left">AI guidance in your dashboard</h3>
            <p className="mt-3 text-sm leading-relaxed text-lk-muted sm:text-base">
              After you create a citizen account, AI legal guidance is available inside your dashboard — including structured intake and verified lawyer suggestions.
            </p>
          </div>
        </div>
      </section>

      <section className="py-14 sm:py-16">
        <div className="lk-page-wide px-5 text-center">
          <h2 className="lk-section-title">Ready to begin?</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-lk-muted sm:text-base">Create your account or browse the directory to connect with verified counsel.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/lawyers" className="rounded-xl bg-lk-accent px-8 py-3 text-sm font-semibold text-white shadow-md shadow-lk-accent/25 transition hover:bg-blue-700">
              Browse lawyers
            </Link>
            <Link
              to="/register"
              className="rounded-xl border border-lk-border bg-lk-surface px-8 py-3 text-sm font-semibold text-lk-navy shadow-sm transition hover:border-lk-accent/30 hover:bg-blue-50/50"
            >
              Get started
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

function StepVisual({ index }: { index: number }) {
  const visuals = [
    <div key="v0" className="flex h-full min-h-[220px] flex-col justify-center rounded-3xl border border-lk-border bg-lk-canvas p-6 shadow-inner">
      <div className="rounded-2xl bg-white p-4 shadow-lk-card ring-1 ring-lk-border">
        <p className="text-[11px] font-semibold uppercase text-lk-muted">AI triage</p>
        <p className="mt-2 text-sm text-lk-navy">
          “Tenant notice period — which ordinance applies in Punjab?”
        </p>
        <span className="mt-3 inline-block rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-lk-accent">Category hint: Rent</span>
      </div>
      <div className="mt-4 flex items-center gap-2 text-xs text-lk-muted">
        <FaSearch className="text-lk-accent" /> Or jump straight to lawyer search
      </div>
    </div>,
    <div key="v1" className="grid min-h-[220px] grid-cols-2 gap-3 rounded-3xl border border-lk-border bg-lk-canvas p-6">
      {[1, 2].map((i) => (
        <div key={i} className="rounded-2xl border border-lk-border bg-white p-4 shadow-sm">
          <div className="h-10 w-10 rounded-full bg-slate-200" />
          <p className="mt-3 text-xs font-semibold text-lk-navy">Verified counsel</p>
          <p className="mt-1 text-[11px] text-lk-muted">4.{i + 7}★ · PKR fee shown</p>
        </div>
      ))}
    </div>,
    <div key="v2" className="min-h-[220px] rounded-3xl border border-lk-border bg-gradient-to-br from-lk-navy to-slate-800 p-6 text-white">
      <p className="text-xs font-semibold uppercase text-white/70">Escrow checkout</p>
      <p className="mt-4 text-2xl font-bold tabular-nums">PKR 12,500</p>
      <p className="mt-2 text-xs text-white/75">Held securely until consultation completion.</p>
      <div className="mt-6 h-2 w-full rounded-full bg-white/20">
        <div className="h-full w-3/5 rounded-full bg-lk-success" />
      </div>
    </div>,
    <div key="v3" className="min-h-[220px] rounded-3xl border border-lk-border bg-white p-6 shadow-lk-card-lg">
      <div className="flex items-center justify-between border-b border-lk-border pb-3">
        <span className="text-sm font-semibold text-lk-navy">Secure chat</span>
        <span className="h-2 w-2 rounded-full bg-lk-success" />
      </div>
      <div className="mt-4 space-y-2">
        <div className="max-w-[85%] rounded-xl rounded-bl-none bg-lk-canvas px-3 py-2 text-xs text-lk-navy">Thanks — I confirm Friday 4 PM.</div>
        <div className="ml-auto max-w-[75%] rounded-xl rounded-br-none bg-lk-accent px-3 py-2 text-xs text-white">Perfect. See you then.</div>
      </div>
    </div>,
  ];
  return <div className="min-w-0">{visuals[index]}</div>;
}
