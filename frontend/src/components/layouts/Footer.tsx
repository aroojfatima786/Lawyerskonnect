import { Link } from 'react-router-dom';
import { FaPhoneAlt, FaEnvelope, FaShieldAlt } from 'react-icons/fa';

const productLinks = [
  { to: '/', label: 'Home' },
  { to: '/lawyers', label: 'Find Lawyers' },
  { to: '/services', label: 'Services' },
];

const companyLinks = [
  { to: '/about', label: 'About' },
  { to: '/contact', label: 'Contact' },
  { to: '/register', label: 'Get started' },
];

const categoryLinks = [
  { to: '/lawyers?practiceArea=Family', label: 'Family Law' },
  { to: '/lawyers?practiceArea=Property', label: 'Property Law' },
  { to: '/lawyers?practiceArea=Criminal', label: 'Criminal Law' },
  { to: '/lawyers?practiceArea=Rent', label: 'Rent Law' },
  { to: '/lawyers?practiceArea=Business', label: 'Business Law' },
  { to: '/lawyers?practiceArea=Labour', label: 'Labour Law' },
];

const trustLinks = [
  { to: '/about', label: 'Verification & trust' },
  { to: '/services', label: 'Payments & escrow' },
  { to: '/contact', label: 'Report an issue' },
];

export function Footer() {
  return (
    <footer className="relative overflow-hidden border-t border-white/10 bg-gradient-to-br from-[#0c1930] via-[#152a4a] to-[#0f2744] text-white">
      <div className="pointer-events-none absolute -right-24 top-1/2 h-72 w-72 -translate-y-1/2 rounded-full bg-lk-accent/12 blur-3xl" />
      <div className="pointer-events-none absolute left-1/4 bottom-0 h-52 w-52 rounded-full bg-amber-500/5 blur-3xl" />
      <div className="relative lk-page-wide py-12 sm:py-14">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-span-4">
            <Link to="/" className="flex items-start gap-4">
              <img src="/image.png" alt="" className="h-14 w-14 shrink-0 rounded-full border-2 border-amber-400/25 object-cover ring-1 ring-white/10" />
              <div>
                <div className="font-serif text-lg font-bold tracking-tight">LawyersKonnect</div>
                <p className="mt-2 text-sm leading-relaxed text-white/78">
                  Pakistan legal marketplace — reviewed lawyer listings, structured bookings, consultation chat, and escrow-style checkout for serious demos.
                </p>
              </div>
            </Link>
            <div className="mt-5 flex flex-col gap-2.5 text-sm text-white/88">
              <a href="tel:+923001234567" className="flex items-center gap-2 transition-opacity hover:text-white">
                <FaPhoneAlt className="text-xs text-amber-200/80" />
                +92 300 1234567
              </a>
              <a href="mailto:info@lawyerskonnect.pk" className="flex items-center gap-2 transition-opacity hover:text-white">
                <FaEnvelope className="text-xs text-amber-200/80" />
                info@lawyerskonnect.pk
              </a>
            </div>
          </div>

          <div className="lg:col-span-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-200/70">Product</h3>
            <ul className="mt-3 space-y-2.5 text-sm">
              {productLinks.map(({ to, label }) => (
                <li key={to}>
                  <Link to={to} className="text-white/78 transition-colors hover:text-white">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:col-span-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-200/70">Company</h3>
            <ul className="mt-3 space-y-2.5 text-sm">
              {companyLinks.map(({ to, label }) => (
                <li key={to}>
                  <Link to={to} className="text-white/78 transition-colors hover:text-white">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:col-span-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-200/70">Practice areas</h3>
            <ul className="mt-3 space-y-2.5 text-sm">
              {categoryLinks.map(({ to, label }) => (
                <li key={to}>
                  <Link to={to} className="text-white/78 transition-colors hover:text-white">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:col-span-2">
            <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-200/70">
              <FaShieldAlt className="text-xs" /> Trust
            </h3>
            <ul className="mt-3 space-y-2.5 text-sm">
              {trustLinks.map(({ to, label }) => (
                <li key={to}>
                  <Link to={to} className="text-white/78 transition-colors hover:text-white">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-6 flex flex-col items-center justify-between gap-3 border-t border-white/10 pt-6 text-center text-xs text-white/50 sm:flex-row sm:text-left">
          <span>© {new Date().getFullYear()} LawyersKonnect. All rights reserved.</span>
          <span className="text-white/40">Legal marketplace · Not a law firm</span>
        </div>
      </div>
    </footer>
  );
}
