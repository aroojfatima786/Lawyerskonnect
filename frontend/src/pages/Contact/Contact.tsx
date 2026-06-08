import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Navbar, Footer } from '../../components/layouts';
import { ContactHeroSupportWash } from '../../components/public/LegalMotifs';
import { Reveal } from '../../components/public/Reveal';
import { FaPhoneAlt, FaEnvelope, FaMapMarkerAlt, FaClock, FaLifeRing, FaUserCheck, FaCreditCard, FaCog } from 'react-icons/fa';
import { Button, Input } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import { publicApi } from '../../services/api';

const supportLanes = [
  {
    icon: <FaLifeRing className="text-lg text-white" />,
    chip: 'from-blue-600 to-indigo-700 ring-blue-500/30',
    title: 'General support',
    desc: 'Routing, timelines, or how to use LawyersKonnect as a visitor.',
  },
  {
    icon: <FaUserCheck className="text-lg text-white" />,
    chip: 'from-emerald-600 to-teal-700 ring-emerald-500/25',
    title: 'Lawyer verification help',
    desc: 'Questions about listing eligibility and credential review — see About for trust framing.',
  },
  {
    icon: <FaCreditCard className="text-lg text-white" />,
    chip: 'from-[#12355B] to-[#1e3a8f] ring-blue-400/25',
    title: 'Payments & appointments',
    desc: 'Checkout quirks, booking state, or when messaging unlocks after payment milestones.',
  },
  {
    icon: <FaCog className="text-lg text-white" />,
    chip: 'from-violet-600 to-indigo-700 ring-violet-500/25',
    title: 'Technical support',
    desc: 'Browser issues, uploads, or unexpected UI behavior — include device and approximate time.',
  },
];

const faqStrip = [
  { q: 'Need help with booking?', hint: 'See Home · Process section.', href: '/#how-it-works' },
  { q: 'Want to verify as a lawyer?', hint: 'Read mission & principles.', href: '/about' },
  { q: 'Payment or chat issue?', hint: 'Escrow stages · consultation tooling.', href: '/services' },
];

const contactHeroLanes = [
  {
    icon: <FaLifeRing className="text-lg text-lk-accent" />,
    title: 'General support',
    note: 'Routing & how to use the platform',
  },
  {
    icon: <FaUserCheck className="text-lg text-emerald-600" />,
    title: 'Lawyer verification',
    note: 'Listing eligibility & credential review',
  },
  {
    icon: <FaCreditCard className="text-lg text-lk-accent" />,
    title: 'Payments & appointments',
    note: 'Checkout, booking state, messaging rules',
  },
  {
    icon: <FaCog className="text-lg text-indigo-600" />,
    title: 'Technical help',
    note: 'Uploads, browser quirks — add device & time',
  },
];

export default function Contact() {
  const toast = useToast();
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    try {
      const res: any = await publicApi.submitContact({
        name: form.name.trim(),
        email: form.email.trim(),
        subject: form.subject.trim(),
        message: form.message.trim(),
      });
      const msg = res?.message || 'We will get back to you soon.';
      toast.success(msg);
      setForm({ name: '', email: '', subject: '', message: '' });
    } catch (err: any) {
      toast.error(err?.message || 'Failed to send message. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-gradient-to-b from-slate-100 via-slate-50 to-slate-100">
      <Navbar />

      <section className="relative overflow-hidden border-b border-slate-200/90 bg-gradient-to-br from-slate-50 via-blue-50/80 to-white py-12 text-lk-navy sm:py-16 lg:py-[4.5rem]">
        <ContactHeroSupportWash />
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
        <div className="pointer-events-none absolute -right-20 top-0 h-72 w-72 rounded-full bg-blue-200/35 blur-3xl" />
        <div className="pointer-events-none absolute -left-16 bottom-0 h-56 w-56 rounded-full bg-indigo-100/50 blur-3xl" />
        <div className="relative z-[1] lk-page-wide grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-12">
          <div>
            <span
              className="lk-hero-enter mb-4 inline-flex rounded-full border border-slate-200/90 bg-white/90 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-lk-accent shadow-sm ring-1 ring-slate-200/70"
              style={{ animationDelay: '0.06s' }}
            >
              Support
            </span>
            <h1
              className="lk-hero-enter max-w-2xl font-serif text-balance text-3xl font-bold leading-[1.12] tracking-tight text-lk-navy sm:text-4xl lg:text-[2.55rem]"
              style={{ animationDelay: '0.14s' }}
            >
              We&apos;re here to help
            </h1>
            <p
              className="lk-hero-enter mt-5 max-w-xl text-base leading-relaxed text-lk-muted sm:text-lg"
              style={{ animationDelay: '0.24s' }}
            >
              Reach the team for routing questions, verification clarifications, booking confusion, or technical issues. Include enough detail for us to reproduce problems.
            </p>
            <a
              href="#contact-form"
              className="lk-hero-enter lk-btn-lift mt-8 inline-flex min-h-[48px] items-center rounded-xl bg-lk-accent px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-900/20 ring-2 ring-blue-500/20 transition hover:bg-blue-600 hover:shadow-xl"
              style={{ animationDelay: '0.32s' }}
            >
              Jump to form
            </a>
          </div>
          <div className="lk-hero-enter-right will-change-transform" style={{ animationDelay: '0.12s' }}>
            <ContactHeroSupportStack />
          </div>
        </div>
      </section>

      <div
        className="pointer-events-none h-6 w-full bg-gradient-to-b from-white via-slate-50/90 to-blue-50/95 sm:h-8"
        aria-hidden
      />

      <section className="relative overflow-hidden bg-gradient-to-b from-blue-50/95 via-slate-50 to-slate-100 py-10 sm:py-12">
        <div className="pointer-events-none absolute -left-24 top-1/4 h-72 w-72 rounded-full bg-blue-200/35 blur-3xl" />
        <div className="pointer-events-none absolute right-0 bottom-0 h-56 w-56 rounded-full bg-indigo-200/30 blur-3xl" />
        <div className="relative lk-page-wide">
          <Reveal>
            <div className="mb-8 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-r from-lk-navy via-[#12355B] to-[#1e3a8f] px-5 py-4 text-center shadow-lg shadow-lk-navy/25 ring-1 ring-white/10 sm:px-6 sm:text-left">
              <p className="text-sm font-semibold text-white">Tell us what happened — we&apos;ll route your message to the right team.</p>
              <p className="mt-1 text-xs text-white/70">Include appointment IDs for booking or payment questions; device and time for technical issues.</p>
            </div>
          </Reveal>
          <div className="grid gap-10 lg:grid-cols-12 lg:gap-12">
            <div className="space-y-4 lg:col-span-5">
              {supportLanes.map((lane, i) => (
                <Reveal key={lane.title} delayMs={i * 70}>
                  <div className="lk-card-lift rounded-2xl border border-slate-200/90 bg-white p-5 shadow-lg shadow-slate-300/20 ring-1 ring-slate-100/90 duration-300 hover:border-blue-200/80 hover:shadow-xl sm:p-6">
                    <div
                      className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br shadow-md ring-1 ${lane.chip}`}
                    >
                      {lane.icon}
                    </div>
                    <h3 className="mt-4 font-semibold text-lk-navy">{lane.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-lk-muted">{lane.desc}</p>
                  </div>
                </Reveal>
              ))}
            </div>

            <div id="contact-form" className="lg:col-span-7">
              <Reveal variant="scale" delayMs={40}>
                <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xl shadow-slate-400/20 ring-1 ring-slate-100/90">
                  <div className="border-b border-slate-200/90 bg-gradient-to-r from-lk-navy via-[#12355B] to-[#1e3a8f] px-6 py-5 sm:px-8 sm:py-6">
                    <h2 className="font-serif text-xl font-bold text-white sm:text-2xl">Write to us</h2>
                    <p className="mt-1 text-sm text-white/70">All fields required. Messages send through the existing public contact endpoint.</p>
                  </div>
                  <div className="p-6 sm:p-8">
                    <form onSubmit={handleSubmit} className="space-y-5">
                      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                        <Input
                          label="Your name"
                          value={form.name}
                          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                          placeholder="Full name"
                          required
                        />
                        <Input
                          label="Email"
                          type="email"
                          value={form.email}
                          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                          placeholder="you@example.com"
                          required
                        />
                      </div>
                      <Input
                        label="Subject"
                        value={form.subject}
                        onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                        placeholder="Topic of your message"
                        required
                      />
                      <div>
                        <label htmlFor="contact-message" className="mb-1.5 block text-sm font-semibold text-lk-navy">
                          Message
                        </label>
                        <textarea
                          id="contact-message"
                          value={form.message}
                          onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                          placeholder="Describe your enquiry…"
                          rows={5}
                          className="w-full rounded-xl border border-lk-border bg-slate-50/80 px-4 py-3 text-sm text-lk-navy placeholder:text-lk-muted/80 transition focus:border-lk-accent focus:bg-white focus:outline-none focus:ring-2 focus:ring-lk-accent/25"
                          required
                        />
                      </div>
                      <div className="pt-2">
                        <Button type="submit" isLoading={sending} className="min-w-[160px] shadow-lg shadow-lk-accent/20" size="lg">
                          Send message
                        </Button>
                      </div>
                    </form>
                  </div>
                </div>
              </Reveal>
              <Reveal delayMs={80}>
                <DirectContactCard className="mt-6" />
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-gradient-to-b from-slate-100 via-indigo-50/35 to-blue-50/40 py-7 sm:py-8">
        <div className="lk-page-wide">
          <p className="mb-4 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-700">Quick routes</p>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-stretch sm:justify-center">
            {faqStrip.map((item) => (
              <Link
                key={item.q}
                to={item.href}
                className="lk-card-lift group flex min-h-[72px] min-w-0 flex-1 flex-col justify-center rounded-2xl border border-slate-200/90 bg-white px-5 py-4 shadow-lg shadow-slate-300/20 ring-1 ring-slate-100/90 duration-300 hover:border-[#12355B]/30 hover:shadow-xl sm:max-w-[280px]"
              >
                <span className="text-sm font-semibold text-lk-navy">{item.q}</span>
                <span className="mt-1 text-xs text-lk-muted group-hover:text-lk-accent">{item.hint}</span>
              </Link>
            ))}
          </div>
          <div className="mt-6 flex justify-center">
            <a
              href="#contact-form"
              className="inline-flex items-center justify-center rounded-xl bg-lk-accent px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-900/20 transition hover:bg-blue-600"
            >
              Jump to form
            </a>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden border-t border-white/10 bg-gradient-to-r from-slate-950 via-blue-950 to-slate-900 py-10 text-white">
        <div className="pointer-events-none absolute right-0 top-1/2 h-40 w-40 -translate-y-1/2 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="relative lk-page-wide flex flex-col items-center justify-between gap-6 text-center sm:flex-row sm:text-left">
          <div>
            <p className="text-lg font-bold tracking-tight">Need legal help now?</p>
            <p className="mt-1 text-sm text-white/75">Search verified counsel and book a consultation through the platform.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-3 sm:justify-end">
            <Link
              to="/lawyers"
              className="lk-btn-lift inline-flex min-h-[44px] items-center justify-center rounded-xl bg-lk-accent px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-black/25 ring-2 ring-white/10 transition hover:bg-blue-600"
            >
              Find Lawyers
            </Link>
            <Link
              to="/register"
              className="lk-btn-lift inline-flex min-h-[44px] items-center justify-center rounded-xl border border-white/25 bg-white/10 px-6 py-2.5 text-sm font-semibold backdrop-blur-sm transition hover:bg-white/15"
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

function ContactHeroSupportStack() {
  return (
    <div className="relative mx-auto max-w-lg lg:max-w-none">
      <div className="pointer-events-none absolute -right-6 -top-8 h-32 w-32 rounded-full bg-blue-200/40 blur-3xl" aria-hidden />
      <div className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 p-4 shadow-xl shadow-slate-300/25 ring-1 ring-slate-100 sm:p-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-lk-muted">Support lanes</p>
        <p className="mt-1 font-serif text-base font-semibold text-lk-navy sm:text-lg">How we can help</p>
        <div className="mt-4 space-y-2.5">
          {contactHeroLanes.map((lane, i) => (
            <Reveal key={lane.title} delayMs={i * 65}>
              <div className="flex items-start gap-3 rounded-xl border border-slate-200/80 bg-gradient-to-br from-white to-slate-50/90 p-3.5 shadow-sm ring-1 ring-slate-100/80 transition hover:border-blue-200/70 sm:p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white shadow-sm">
                  {lane.icon}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-lk-navy">{lane.title}</p>
                  <p className="mt-0.5 text-xs leading-snug text-lk-muted">{lane.note}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </div>
  );
}

function DirectContactCard({ className = '' }: { className?: string }) {
  return (
    <div
      className={`overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-5 shadow-lg shadow-slate-300/20 ring-1 ring-slate-100/90 sm:p-6 ${className}`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-lk-muted">Direct contact</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="flex items-start gap-3">
          <FaEnvelope className="mt-0.5 shrink-0 text-lk-accent" />
          <div>
            <p className="text-sm font-semibold text-lk-navy">Email</p>
            <a href="mailto:info@lawyerskonnect.pk" className="mt-1 block text-sm font-medium text-lk-accent hover:underline">
              info@lawyerskonnect.pk
            </a>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <FaPhoneAlt className="mt-0.5 shrink-0 text-lk-accent" />
          <div>
            <p className="text-sm font-semibold text-lk-navy">Phone</p>
            <a href="tel:+923001234567" className="mt-1 block text-sm font-medium text-lk-accent hover:underline">
              +92 300 1234567
            </a>
          </div>
        </div>
        <div className="flex items-start gap-3 sm:col-span-2 sm:border-t sm:border-slate-200 sm:pt-4">
          <FaClock className="mt-0.5 shrink-0 text-lk-accent" />
          <div>
            <p className="text-sm font-semibold text-lk-navy">Response window</p>
            <p className="mt-1 text-sm text-lk-muted">
              Typically <strong className="text-lk-navy">2–3 business days</strong> for general mail. Reference appointment IDs for payment disputes.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3 sm:col-span-2">
          <FaMapMarkerAlt className="mt-0.5 shrink-0 text-lk-accent" />
          <div>
            <p className="text-sm font-semibold text-lk-navy">Coverage</p>
            <p className="mt-1 text-sm text-lk-muted">Pakistan-wide marketplace — cities reflect lawyer listings.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
