import { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { FaPhoneAlt, FaEnvelope, FaBars, FaTimes, FaChevronDown } from 'react-icons/fa';

const primaryLinks = [
  { to: '/', label: 'Home' },
  { to: '/lawyers', label: 'Find Lawyers' },
] as const;

const exploreLinks = [
  { to: '/about', label: 'About', desc: 'Mission & trust story.' },
  { to: '/services', label: 'Services', desc: 'Platform capabilities.' },
  { to: '/contact', label: 'Contact', desc: 'Support & enquiries.' },
] as const;

export function Navbar() {
  const { user, isAuthenticated, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [exploreOpen, setExploreOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const exploreRef = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (exploreRef.current && !exploreRef.current.contains(t)) setExploreOpen(false);
      if (accountRef.current && !accountRef.current.contains(t)) setAccountOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const dashboardPath =
    user?.role === 'admin' ? '/admin' : user?.role === 'lawyer' ? '/lawyer/dashboard' : '/client/dashboard';

  const profilePath = user?.role === 'lawyer' ? '/lawyer/profile' : '/client/profile';

  const handleLogout = async () => {
    setAccountOpen(false);
    await logout();
    navigate('/');
  };

  const isActive = (path: string) =>
    path === '/'
      ? location.pathname === '/'
      : location.pathname === path || location.pathname.startsWith(`${path}/`);

  const exploreLinkActive = (to: string) => isActive(to);

  const exploreSectionActive = exploreLinks.some(({ to }) => exploreLinkActive(to));

  const linkClass = (path: string) =>
    `text-sm font-medium transition-colors ${
      isActive(path) ? 'text-lk-accent' : 'text-slate-600 hover:text-lk-navy'
    }`;

  const dropdownShell =
    'rounded-2xl border border-slate-200/90 bg-white/95 py-2 shadow-2xl shadow-slate-400/20 ring-1 ring-slate-200/70 backdrop-blur-xl';

  return (
    <>
      <div className="hidden border-b border-white/10 bg-lk-navy text-xs text-white sm:block">
        <div className="lk-page flex justify-end gap-6 py-2 sm:text-sm">
          <a href="tel:+923001234567" className="flex items-center gap-2 opacity-90 hover:opacity-100">
            <FaPhoneAlt className="text-[10px]" />
            +92 300 1234567
          </a>
          <a href="mailto:info@lawyerskonnect.pk" className="flex items-center gap-2 opacity-90 hover:opacity-100">
            <FaEnvelope className="text-[10px]" />
            info@lawyerskonnect.pk
          </a>
        </div>
      </div>

      <header className="sticky top-0 z-50 border-b border-lk-border bg-lk-surface/95 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-lk-surface/90">
        <div className="lk-page flex min-h-[60px] items-center justify-between gap-3 py-2 sm:gap-4">
          <Link to="/" className="flex min-w-0 shrink items-center gap-2 sm:gap-3">
            <img src="/image.png" alt="LawyersKonnect" className="h-10 w-10 shrink-0 rounded-full border border-lk-border object-cover sm:h-11 sm:w-11" />
            <div className="min-w-0 leading-tight">
              <div className="truncate text-[15px] font-bold tracking-tight text-lk-navy sm:text-base">LawyersKonnect</div>
              <div className="hidden truncate text-[11px] text-lk-muted sm:block">Legal marketplace</div>
            </div>
          </Link>

          <nav className="hidden min-w-0 flex-1 items-center justify-center gap-6 lg:flex lg:gap-8">
            {primaryLinks.map(({ to, label }) => (
              <Link key={to} to={to} className={linkClass(to)}>
                {label}
              </Link>
            ))}

            <div className="relative shrink-0" ref={exploreRef}>
              <button
                type="button"
                aria-expanded={exploreOpen}
                aria-haspopup="menu"
                onClick={() => setExploreOpen((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-xl px-2 py-1.5 text-sm font-medium transition-colors ${
                  exploreSectionActive || exploreOpen ? 'text-lk-accent' : 'text-slate-600 hover:text-lk-navy'
                }`}
              >
                Explore
                <FaChevronDown className={`text-[10px] opacity-70 transition-transform duration-200 ${exploreOpen ? 'rotate-180' : ''}`} />
              </button>

              {exploreOpen && (
                <div
                  role="menu"
                  className={`lk-dropdown-animate absolute left-0 top-full z-[100] mt-2 min-w-[min(100vw-2rem,240px)] max-w-[calc(100vw-2rem)] overflow-hidden ${dropdownShell}`}
                >
                  <div className="border-b border-slate-200/80 bg-gradient-to-r from-[#102A43]/8 via-blue-50/90 to-white px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-800">Explore</p>
                  </div>
                  {exploreLinks.map(({ to, label, desc }) => (
                    <Link
                      key={to}
                      to={to}
                      role="menuitem"
                      className={`block border-b border-slate-100 px-3 py-2.5 transition-colors last:border-0 hover:bg-blue-50/80 ${
                        exploreLinkActive(to) ? 'bg-blue-50/95' : ''
                      }`}
                      onClick={() => setExploreOpen(false)}
                    >
                      <span className="block text-sm font-semibold text-lk-navy">{label}</span>
                      <span className="mt-0.5 block text-[11px] leading-snug text-lk-muted">{desc}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </nav>

          <div className="hidden shrink-0 items-center gap-2 lg:flex">
            {!isAuthenticated ? (
              <>
                <Link to="/auth/citizen/login" className="rounded-xl px-4 py-2 text-sm font-semibold text-lk-navy hover:bg-slate-50">
                  Sign in
                </Link>
                <Link
                  to="/register"
                  className="rounded-xl bg-lk-accent px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-lk-accent/20 transition hover:bg-blue-700"
                >
                  Get started
                </Link>
              </>
            ) : (
              <>
                <Link
                  to={dashboardPath}
                  className="rounded-xl bg-lk-navy px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
                >
                  Dashboard
                </Link>
                <div className="relative" ref={accountRef}>
                  <button
                    type="button"
                    aria-expanded={accountOpen}
                    onClick={() => setAccountOpen((v) => !v)}
                    className="inline-flex max-w-[min(200px,22vw)] items-center gap-2 rounded-xl border border-lk-border bg-white px-3 py-2 text-sm font-medium text-lk-navy hover:bg-slate-50"
                  >
                    <span className="truncate">{user?.email?.split('@')[0] ?? 'Account'}</span>
                    <FaChevronDown className={`shrink-0 text-[10px] opacity-60 transition-transform duration-200 ${accountOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {accountOpen && (
                    <div className={`lk-dropdown-animate absolute right-0 top-full z-[100] mt-2 min-w-[220px] overflow-hidden ${dropdownShell}`}>
                      {user?.role !== 'admin' && (
                        <Link
                          to={profilePath}
                          onClick={() => setAccountOpen(false)}
                          className="block px-4 py-2.5 text-sm font-medium text-lk-navy transition-colors hover:bg-blue-50 hover:text-lk-accent"
                        >
                          Profile settings
                        </Link>
                      )}
                      <button
                        type="button"
                        onClick={handleLogout}
                        className="block w-full px-4 py-2.5 text-left text-sm font-medium text-lk-muted transition-colors hover:bg-slate-50 hover:text-lk-navy"
                      >
                        Log out
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            className="rounded-xl p-2.5 text-lk-navy ring-1 ring-inset ring-lk-border hover:bg-slate-50 lg:hidden"
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
          >
            {mobileMenuOpen ? <FaTimes size={20} /> : <FaBars size={20} />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="max-h-[min(85vh,calc(100dvh-52px))] overflow-y-auto overscroll-contain border-t border-lk-border bg-lk-surface lg:hidden">
            <div className="lk-page flex flex-col gap-1 py-4 pb-6">
              {primaryLinks.map(({ to, label }) => (
                <Link
                  key={to}
                  to={to}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`rounded-xl px-4 py-3 text-sm font-medium ${isActive(to) ? 'bg-blue-50 text-lk-accent' : 'text-lk-navy hover:bg-slate-50'}`}
                >
                  {label}
                </Link>
              ))}

              <div className="px-4 pt-4 text-[11px] font-semibold uppercase tracking-wide text-lk-muted">Explore</div>
              <div className="lk-dropdown-animate rounded-xl border border-lk-border bg-lk-canvas/60 px-2 py-1">
                {exploreLinks.map(({ to, label, desc }) => (
                  <Link
                    key={to}
                    to={to}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`block rounded-lg px-3 py-2.5 ${exploreLinkActive(to) ? 'bg-white shadow-sm' : ''}`}
                  >
                    <span className="text-sm font-semibold text-lk-navy">{label}</span>
                    <span className="mt-0.5 block text-xs text-lk-muted">{desc}</span>
                  </Link>
                ))}
              </div>

              <hr className="my-2 border-lk-border" />
              {!isAuthenticated ? (
                <>
                  <Link to="/auth/citizen/login" onClick={() => setMobileMenuOpen(false)} className="rounded-xl px-4 py-3 text-sm font-medium text-lk-navy hover:bg-slate-50">
                    Sign in
                  </Link>
                  <Link to="/auth/lawyer/login" onClick={() => setMobileMenuOpen(false)} className="rounded-xl px-4 py-3 text-sm text-lk-muted hover:bg-slate-50">
                    Lawyer sign in
                  </Link>
                  <Link
                    to="/register"
                    onClick={() => setMobileMenuOpen(false)}
                    className="mt-1 rounded-xl bg-lk-accent px-4 py-3 text-center text-sm font-semibold text-white"
                  >
                    Get started
                  </Link>
                </>
              ) : (
                <>
                  <Link to={dashboardPath} onClick={() => setMobileMenuOpen(false)} className="rounded-xl px-4 py-3 text-sm font-semibold text-lk-accent hover:bg-blue-50/80">
                    Dashboard
                  </Link>
                  {user?.role !== 'admin' && (
                    <Link to={profilePath} onClick={() => setMobileMenuOpen(false)} className="rounded-xl px-4 py-3 text-sm text-lk-navy hover:bg-slate-50">
                      Profile settings
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      handleLogout();
                    }}
                    className="rounded-xl px-4 py-3 text-left text-sm text-lk-muted hover:bg-slate-50"
                  >
                    Log out
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </header>
    </>
  );
}
