import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, useRole } from '../../context/AuthContext';
import { notificationApi } from '../../services/api';
import { Avatar } from '../ui/Avatar';
import { AIChatbotWidget } from '../chat/AIChatbotWidget';
import { getDashboardHeaderMeta } from '../../utils/dashboardHeaderMeta';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import {
  FiHome,
  FiSearch,
  FiCalendar,
  FiMessageSquare,
  FiCreditCard,
  FiUser,
  FiLogOut,
  FiMenu,
  FiX,
  FiBell,
  FiUsers,
  FiCheckSquare,
  FiStar,
  FiFileText,
  FiHelpCircle,
  FiAlertTriangle,
  FiClipboard,
  FiBarChart2,
  FiAward,
  FiArrowLeft,
  FiCpu,
} from 'react-icons/fi';

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
}

function NavSection({
  title,
  children,
  collapsed,
}: {
  title: string;
  children: React.ReactNode;
  collapsed?: boolean;
}) {
  return (
    <div className={`mb-6 mt-1 first:mt-0 ${collapsed ? 'mb-3' : ''}`}>
      {!collapsed ? (
        <div className="mb-2 px-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/50">{title}</div>
      ) : null}
      <ul className="space-y-0.5">{children}</ul>
    </div>
  );
}

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const { isLawyer, isAdmin, isCitizen } = useRole();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [miniPopup, setMiniPopup] = useState<string>('');
  const prefersReducedMotion = usePrefersReducedMotion();

  React.useEffect(() => {
    let mounted = true;
    notificationApi
      .getUnreadCount()
      .then((res: any) => {
        if (!mounted) return;
        setUnreadCount(Number(res?.count || 0));
      })
      .catch(() => {});

    const handler = (event: Event) => {
      const custom = event as CustomEvent<any>;
      const notification = custom?.detail || {};
      const title = notification?.title || 'New notification';
      setUnreadCount((prev) => prev + 1);
      setMiniPopup(title);
      window.setTimeout(() => setMiniPopup(''), 3500);
    };
    window.addEventListener('lk:new-notification', handler as EventListener);
    const unreadHandler = (event: Event) => {
      const custom = event as CustomEvent<{ count?: number }>;
      if (typeof custom?.detail?.count === 'number') {
        setUnreadCount(custom.detail.count);
      }
    };
    window.addEventListener('lk:unread-notifications-updated', unreadHandler as EventListener);
    return () => {
      mounted = false;
      window.removeEventListener('lk:new-notification', handler as EventListener);
      window.removeEventListener('lk:unread-notifications-updated', unreadHandler as EventListener);
    };
  }, []);

  const isGuidanceFocus = isCitizen && location.pathname.startsWith('/client/legal-guidance');
  const sidebarCollapsed = isGuidanceFocus;

  const citizenNavMain: NavItem[] = [
    { label: 'Dashboard', path: '/client/dashboard', icon: <FiHome /> },
    { label: 'Find Lawyers', path: '/client/find-lawyer', icon: <FiSearch /> },
    { label: 'AI Legal Guidance', path: '/client/legal-guidance', icon: <FiCpu /> },
  ];
  const citizenNavConsultations: NavItem[] = [
    { label: 'Appointments', path: '/client/appointments', icon: <FiCalendar /> },
    { label: 'Messages', path: '/client/messages', icon: <FiMessageSquare /> },
    { label: 'Payments', path: '/client/payments', icon: <FiCreditCard /> },
  ];
  const citizenNavAccount: NavItem[] = [
    { label: 'My Reviews', path: '/client/reviews', icon: <FiStar /> },
    { label: 'Notifications', path: '/client/notifications', icon: <FiBell /> },
    { label: 'Profile settings', path: '/client/profile', icon: <FiUser /> },
    { label: 'Help & Support', path: '/client/support', icon: <FiHelpCircle /> },
  ];

  const lawyerMain: NavItem[] = [
    { label: 'Dashboard', path: '/lawyer/dashboard', icon: <FiHome /> },
    { label: 'Appointments', path: '/lawyer/appointments', icon: <FiCalendar /> },
    { label: 'Messages', path: '/lawyer/messages', icon: <FiMessageSquare /> },
    { label: 'Earnings', path: '/lawyer/earnings', icon: <FiCreditCard /> },
    { label: 'Subscription', path: '/lawyer/subscription', icon: <FiAward /> },
    { label: 'Reviews', path: '/lawyer/reviews', icon: <FiStar /> },
  ];

  const lawyerSecondary: NavItem[] = [{ label: 'Help & Support', path: '/lawyer/support', icon: <FiHelpCircle /> }];

  const adminMain: NavItem[] = [
    { label: 'Dashboard', path: '/admin', icon: <FiHome /> },
    { label: 'Users', path: '/admin/users', icon: <FiUsers /> },
    { label: 'Verifications', path: '/admin/verifications', icon: <FiCheckSquare /> },
    { label: 'Payments', path: '/admin/payments', icon: <FiCreditCard /> },
    { label: 'Reports', path: '/admin/reports', icon: <FiBarChart2 /> },
    { label: 'Complaints', path: '/admin/complaints', icon: <FiHelpCircle /> },
    { label: 'Reviews', path: '/admin/reviews', icon: <FiStar /> },
    { label: 'Categories', path: '/admin/categories', icon: <FiFileText /> },
    { label: 'Legal Knowledge', path: '/admin/legal-knowledge', icon: <FiFileText /> },
    { label: 'Announcements', path: '/admin/announcements', icon: <FiClipboard /> },
    { label: 'Chat Violations', path: '/admin/chat-violations', icon: <FiAlertTriangle /> },
  ];

  const profileName =
    user?.citizenProfile?.fullName || user?.lawyerProfile?.fullName || user?.email?.split('@')[0] || 'User';

  const portalLabel = isAdmin ? 'Admin console' : isLawyer ? 'Lawyer portal' : 'Citizen Portal';

  const shellBg = 'bg-[#F3F7FD]';
  const avatarSrc = isLawyer ? user?.lawyerProfile?.profilePictureUrl : undefined;

  const headerMeta = getDashboardHeaderMeta(location.pathname);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const notificationsPath = isAdmin ? '/notifications' : isLawyer ? '/lawyer/notifications' : '/client/notifications';

  const navLinkActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(`${path}/`);

  const renderNavItems = (items: NavItem[], collapsed = false) =>
    items.map((item) => {
      const active = navLinkActive(item.path);
      return (
        <li key={item.path}>
          <Link
            to={item.path}
            title={collapsed ? item.label : undefined}
            onClick={() => setSidebarOpen(false)}
            className={`flex items-center rounded-xl py-2.5 text-sm font-medium transition-colors ${
              collapsed ? 'justify-center px-2' : 'gap-3 px-4'
            } ${
              active
                ? 'bg-[#1a3a6b] text-white shadow-inner ring-1 ring-white/10'
                : 'text-white/75 hover:bg-white/[0.06] hover:text-white'
            } ${!prefersReducedMotion ? 'motion-safe:duration-200' : ''}`}
          >
            <span className={`flex shrink-0 justify-center text-lg opacity-95 ${collapsed ? '' : 'w-5'}`}>
              {item.icon}
            </span>
            {!collapsed ? item.label : null}
          </Link>
        </li>
      );
    });

  return (
    <div className={`min-h-screen ${shellBg}`}>
      <div
        className={`fixed left-0 right-0 top-0 z-40 flex h-[52px] items-center justify-between border-b border-white/10 bg-gradient-to-b from-lk-navy to-[#0f172a] px-4 py-2 text-white shadow-sm lg:hidden`}
      >
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          className="rounded-xl p-2 text-white/90 hover:bg-white/10"
        >
          <FiMenu size={22} />
        </button>
        <div className="text-center">
          <div className="text-sm font-bold text-white">LawyersKonnect</div>
          <div className="text-[10px] font-medium uppercase tracking-wide text-white/55">{portalLabel}</div>
        </div>
        <Link to={notificationsPath} className="relative rounded-xl p-2 text-white/90 hover:bg-white/10">
          <FiBell size={20} />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-lk-danger px-1 text-[10px] font-bold text-white">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Link>
      </div>

      {sidebarOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-lk-navy/40 lg:hidden"
          aria-label="Close menu overlay"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed left-0 top-0 z-50 flex h-full flex-col border-r border-white/[0.08] bg-gradient-to-b from-lk-navy via-[#0f172a] to-[#0f172a] text-white shadow-[0_16px_48px_-12px_rgba(2,6,23,0.45)] transition-all duration-300 motion-reduce:transition-none lg:translate-x-0 ${
          sidebarCollapsed ? 'w-[72px]' : 'w-[292px]'
        } ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex flex-col gap-3 border-b border-white/10 p-5 pb-4">
          <div className="flex items-start justify-between gap-2">
            <Link to="/" className="flex min-w-0 flex-1 items-center gap-3.5" onClick={() => setSidebarOpen(false)}>
              <img src="/image.png" alt="" className="h-11 w-11 shrink-0 rounded-full border-2 border-white/20 object-cover shadow-md shadow-black/20" />
              <div className="min-w-0">
                <div className="truncate text-sm font-bold tracking-tight">LawyersKonnect</div>
                <div className="truncate text-[11px] font-medium uppercase tracking-[0.12em] text-white/50">{portalLabel}</div>
              </div>
            </Link>
            <button type="button" onClick={() => setSidebarOpen(false)} className="rounded-lg p-2 hover:bg-white/10 lg:hidden">
              <FiX size={20} />
            </button>
          </div>
        </div>

        <nav className="lk-scroll-dark flex-1 overflow-y-auto overscroll-contain px-3 pb-6 pt-2">
          {isCitizen && (
            <>
              <NavSection title="Main" collapsed={sidebarCollapsed}>{renderNavItems(citizenNavMain, sidebarCollapsed)}</NavSection>
              <NavSection title="Consultations" collapsed={sidebarCollapsed}>{renderNavItems(citizenNavConsultations, sidebarCollapsed)}</NavSection>
              <NavSection title="Account" collapsed={sidebarCollapsed}>{renderNavItems(citizenNavAccount, sidebarCollapsed)}</NavSection>
            </>
          )}
          {isLawyer && (
            <>
              <NavSection title="Practice" collapsed={sidebarCollapsed}>{renderNavItems(lawyerMain, sidebarCollapsed)}</NavSection>
              <NavSection title="Support" collapsed={sidebarCollapsed}>{renderNavItems(lawyerSecondary, sidebarCollapsed)}</NavSection>
            </>
          )}
          {isAdmin && <NavSection title="Admin" collapsed={sidebarCollapsed}>{renderNavItems(adminMain, sidebarCollapsed)}</NavSection>}
        </nav>

        <div className="mt-auto border-t border-white/10 bg-black/5 p-2">
          {!isAdmin && isLawyer && !sidebarCollapsed ? (
            <Link
              to="/lawyer/profile"
              onClick={() => setSidebarOpen(false)}
              className="mb-1 flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            >
              <FiUser className="text-lg" />
              Profile &amp; settings
            </Link>
          ) : null}
          {!isAdmin && isLawyer && sidebarCollapsed ? (
            <Link
              to="/lawyer/profile"
              title="Profile & settings"
              onClick={() => setSidebarOpen(false)}
              className="mb-1 flex items-center justify-center rounded-xl px-2 py-2.5 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            >
              <FiUser className="text-lg" />
            </Link>
          ) : null}
          <button
            type="button"
            onClick={handleLogout}
            title="Log out"
            className={`flex w-full items-center rounded-xl py-2.5 text-sm font-semibold text-red-300 transition-colors hover:bg-red-500/15 hover:text-red-200 ${
              sidebarCollapsed ? 'justify-center px-2' : 'gap-3 px-4'
            }`}
          >
            <FiLogOut className="text-lg" />
            {!sidebarCollapsed ? 'Log out' : null}
          </button>
        </div>

        {isAdmin ? (
          <div className="border-t border-white/10 p-3">
            <div className="flex items-center gap-3 rounded-2xl border border-white/12 bg-white/[0.07] p-3 shadow-inner shadow-black/15">
              <Avatar src={undefined} name={profileName} size="md" />
              {!sidebarCollapsed ? (
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-white">{profileName}</div>
                  <div className="truncate text-xs text-white/55">{user?.email}</div>
                  <div className="mt-1 text-[11px] font-medium text-white/45">Administrator</div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </aside>

      <main className={`min-h-screen pt-[52px] lg:pt-0 ${sidebarCollapsed ? 'lg:ml-[72px]' : 'lg:ml-[292px]'}`}>
        {!isGuidanceFocus ? (
        <header
          className={`sticky top-0 z-30 hidden min-h-[76px] border-b px-5 py-3.5 shadow-md backdrop-blur-md lg:flex lg:items-center lg:justify-between lg:px-8 ${
            isCitizen
              ? 'border-slate-200/90 bg-white/95 supports-[backdrop-filter]:bg-white/90'
              : 'border-slate-200/90 bg-white/95 supports-[backdrop-filter]:bg-white/90'
          }`}
        >
          <div className="min-w-0 pr-4">
            {headerMeta.backTo ? (
              <button
                type="button"
                onClick={() => navigate(headerMeta.backTo!)}
                className="mb-2 inline-flex items-center gap-1.5 rounded-lg px-1 py-0.5 text-sm font-semibold text-lk-muted transition hover:text-lk-navy"
              >
                <FiArrowLeft className="text-base" />
                Back
              </button>
            ) : null}
            <h1 className="text-balance text-2xl font-bold tracking-tight text-lk-navy sm:text-[1.65rem]">{headerMeta.title}</h1>
            {headerMeta.subtitle ? (
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-lk-muted">{headerMeta.subtitle}</p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            {miniPopup && (
              <div className="max-w-[220px] rounded-xl border border-blue-100 bg-blue-50/95 px-3 py-2 text-xs leading-snug text-blue-900 shadow-sm xl:max-w-xs">
                {miniPopup}
              </div>
            )}
            <Link
              to={notificationsPath}
              className={`relative rounded-xl border p-2.5 text-lk-navy transition-colors ${
                isCitizen
                  ? 'border-slate-200/80 bg-slate-50/80 hover:border-lk-accent/25 hover:bg-blue-50/60'
                  : 'border-transparent hover:border-lk-border hover:bg-lk-canvas'
              }`}
            >
              <FiBell size={20} className={isCitizen ? 'text-lk-navy' : ''} />
              {unreadCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-lk-danger px-1 text-[10px] font-bold text-white shadow-sm ring-2 ring-white">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </Link>
            {!isAdmin && (
              <Link
                to={isLawyer ? '/lawyer/profile' : '/client/profile'}
                className={`flex max-w-[200px] items-center gap-2.5 rounded-xl border px-2.5 py-2 shadow-lk-card transition-shadow sm:max-w-[240px] sm:gap-3 sm:px-3 ${
                  isCitizen
                    ? 'border-slate-200/90 bg-white hover:border-lk-accent/20 hover:shadow-lk-card-md'
                    : 'border-lk-border bg-lk-surface hover:border-slate-300 hover:shadow-lk-card-md'
                }`}
              >
                <Avatar src={avatarSrc} name={profileName} size="sm" />
                <span className="truncate text-sm font-semibold text-lk-navy">{profileName}</span>
              </Link>
            )}
          </div>
        </header>
        ) : null}

        <div
          className={`mx-auto w-full overflow-x-hidden ${
            isGuidanceFocus
              ? 'h-[100dvh] max-w-none px-0 py-0'
              : `max-w-content px-4 py-5 sm:px-5 lg:max-w-wide lg:px-8 ${isCitizen ? 'lg:py-7' : 'lg:py-8'}`
          }`}
        >
          {children}
        </div>
      </main>

      {isCitizen && !isGuidanceFocus && <AIChatbotWidget />}
    </div>
  );
}
