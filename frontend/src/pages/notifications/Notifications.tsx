import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  FiBell, FiCalendar, FiDollarSign, FiCheckCircle, FiMessageSquare, FiStar, FiCheck, FiSettings
} from 'react-icons/fi';
import { notificationApi } from '../../services/api';
import { Card, CardHeader, Button, Modal, PremiumTabs } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import { NotificationType } from '../../types';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '../../context/AuthContext';
import { getApiBaseUrl } from '../../config/apiBase';
import { authStorage } from '../../utils/authStorage';

// Normalize notification actionUrl so View goes to correct page in current dashboard (citizen/lawyer/admin)
function normalizeActionUrl(actionUrl: string | undefined, pathname: string): string | undefined {
  if (!actionUrl || typeof actionUrl !== 'string') return undefined;
  const isAdmin = pathname === '/notifications' || pathname.startsWith('/admin');
  const isLawyer = pathname.startsWith('/lawyer');
  const isClient = pathname.startsWith('/client');

  // Already full dashboard paths – use as is if matches current role
  if (actionUrl.startsWith('/admin/')) return isAdmin ? actionUrl : '/admin';
  if (actionUrl.startsWith('/lawyer/')) return isLawyer ? actionUrl : isClient ? '/client/dashboard' : '/admin';
  if (actionUrl.startsWith('/client/')) return isClient ? actionUrl : isLawyer ? '/lawyer/dashboard' : '/admin';

  // Relative or generic paths – map to correct dashboard page
  if (actionUrl.startsWith('/appointments')) return isLawyer ? '/lawyer/appointments' : '/client/appointments';
  if (actionUrl.startsWith('/payments')) return isLawyer ? '/lawyer/earnings' : '/client/payments';
  if (actionUrl.startsWith('/profile') || actionUrl === '/profile/verification') return isLawyer ? '/lawyer/profile' : '/client/profile';
  if (actionUrl.startsWith('/messages')) return isLawyer ? '/lawyer/messages' : '/client/messages';
  if (actionUrl.startsWith('/lawyer/reviews') || actionUrl === '/lawyer/reviews') return isLawyer ? '/lawyer/reviews' : '/client/reviews';

  // Fallback: dashboard for current role (never send to home)
  if (isAdmin) return '/admin';
  if (isLawyer) return '/lawyer/dashboard';
  return '/client/dashboard';
}

const DEFAULT_PREFS = { inApp: true, email: true, sms: true };

function notifyUnreadCount(count: number) {
  window.dispatchEvent(new CustomEvent('lk:unread-notifications-updated', { detail: { count } }));
}

export default function Notifications() {
  const { pathname } = useLocation();
  useAuth();
  const token = authStorage.getToken();
  const toast = useToast();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [preferences, setPreferences] = useState<{ inApp?: boolean; email?: boolean; sms?: boolean }>(DEFAULT_PREFS);
  const [prefsLoading, setPrefsLoading] = useState(false);
  const [showPrefs, setShowPrefs] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [notificationToDelete, setNotificationToDelete] = useState<any>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [filter, setFilter] = useState<'all' | 'unread' | 'appointments' | 'payments' | 'messages' | 'system'>('all');

  useEffect(() => {
    loadNotifications();
    loadPreferences();
    setupSocket();
    
    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, [token]);

  const setupSocket = () => {
    if (!token) return;
    
    const newSocket = io(`${getApiBaseUrl()}/chat`, {
      auth: { token },
    });

    newSocket.on('connect', () => {
      console.log('Connected to notification socket');
    });

    newSocket.on('notification', (notification: any) => {
      // Add new notification to the list
      setNotifications(prev => [notification, ...prev]);
      setUnreadCount(prev => prev + 1);
    });

    newSocket.on('disconnect', () => {
      console.log('Disconnected from notification socket');
    });

    setSocket(newSocket);
  };

  const loadPreferences = async () => {
    try {
      const res: any = await notificationApi.getPreferences();
      setPreferences(res?.data ?? DEFAULT_PREFS);
    } catch {
      setPreferences(DEFAULT_PREFS);
    }
  };

  const handleSavePreferences = async () => {
    setPrefsLoading(true);
    try {
      await notificationApi.setPreferences(preferences);
      toast.success('Notification preferences saved');
      setShowPrefs(false);
    } catch (error: any) {
      toast.error(error.message || 'Failed to save preferences');
    } finally {
      setPrefsLoading(false);
    }
  };

  const loadNotifications = async () => {
    try {
      const response: any = await notificationApi.getAll(1, 50);
      const raw = response?.data;
      const list = Array.isArray(raw) ? raw : [];
      setNotifications(list);
      setUnreadCount(response?.unreadCount ?? 0);
    } catch (error) {
      console.error('Failed to load notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsRead = async (id: string) => {
    try {
      await notificationApi.markAsRead(id);
      const wasUnread = notifications.find((n) => n._id === id && !n.isRead);
      setNotifications((prev) => prev.filter((n) => n._id !== id));
      const newCount = wasUnread ? Math.max(0, unreadCount - 1) : unreadCount;
      setUnreadCount(newCount);
      notifyUnreadCount(newCount);
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await notificationApi.markAllAsRead();
      setNotifications([]);
      setUnreadCount(0);
      notifyUnreadCount(0);
      toast.success('All notifications marked as read');
    } catch (error: any) {
      toast.error(error.message || 'Failed to mark all as read');
    }
  };

  const handleDeleteClick = (notification: any) => {
    setNotificationToDelete(notification);
    setDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!notificationToDelete) return;
    try {
      await notificationApi.delete(notificationToDelete._id);
      const wasUnread = !notificationToDelete.isRead;
      setNotifications(notifications.filter((n) => n._id !== notificationToDelete._id));
      if (wasUnread) {
        const newCount = Math.max(0, unreadCount - 1);
        setUnreadCount(newCount);
        notifyUnreadCount(newCount);
      }
      toast.success('Notification deleted');
      setDeleteModalOpen(false);
      setNotificationToDelete(null);
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete');
    }
  };

  const getIcon = (type: NotificationType) => {
    const cls = 'text-lg text-lk-accent';
    if (type.includes('appointment')) return <FiCalendar className={cls} />;
    if (type.includes('payment') || type.includes('refund')) return <FiDollarSign className={cls} />;
    if (type.includes('verification')) return <FiCheckCircle className={cls} />;
    if (type.includes('message')) return <FiMessageSquare className={cls} />;
    if (type.includes('review')) return <FiStar className={cls} />;
    return <FiBell className={cls} />;
  };

  const filteredNotifications = useMemo(() => {
    const t = (n: any) => String(n?.type || '');
    return notifications.filter((n) => {
      if (filter === 'unread') return !n.isRead;
      if (filter === 'appointments') return t(n).includes('appointment');
      if (filter === 'payments') return t(n).includes('payment') || t(n).includes('refund');
      if (filter === 'messages') return t(n).includes('message');
      if (filter === 'system')
        return (
          t(n).includes('system') ||
          t(n).includes('account') ||
          t(n).includes('verification')
        );
      return true;
    });
  }, [notifications, filter]);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 overflow-x-hidden lg:space-y-6">
      <div className="lk-portal-page-head">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowPrefs(!showPrefs)}>
            <FiSettings className="mr-1" /> Preferences
          </Button>
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={handleMarkAllAsRead}>
              <FiCheck className="mr-1" /> Mark all read
            </Button>
          )}
        </div>
        <div className="mt-4">
          <PremiumTabs
            tabs={[
              { id: 'all', label: 'All' },
              { id: 'unread', label: 'Unread' },
              { id: 'appointments', label: 'Appointments' },
              { id: 'payments', label: 'Payments' },
              { id: 'messages', label: 'Messages' },
              { id: 'system', label: 'System' },
            ]}
            active={filter}
            onChange={setFilter}
            size="sm"
          />
        </div>
      </div>

      {/* UC-08: Notification preferences */}
      {showPrefs && (
        <Card>
          <CardHeader title="Notification preferences" />
          <div className="p-4 space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={!!preferences.inApp}
                onChange={(e) => setPreferences({ ...preferences, inApp: e.target.checked })}
                className="rounded border-slate-300"
              />
              <span>In-app notifications</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={!!preferences.email}
                onChange={(e) => setPreferences({ ...preferences, email: e.target.checked })}
                className="rounded border-slate-300"
              />
              <span>Email notifications</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={!!preferences.sms}
                onChange={(e) => setPreferences({ ...preferences, sms: e.target.checked })}
                className="rounded border-slate-300"
              />
              <span>SMS notifications</span>
            </label>
            <div className="flex gap-2 pt-2">
              <Button size="sm" onClick={handleSavePreferences} isLoading={prefsLoading}>
                Save
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowPrefs(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Card padding="none" className="lk-portal-card overflow-hidden rounded-2xl border-slate-200/90 shadow-lk-card-lg ring-1 ring-slate-100/80">
        {loading ? (
          <div className="space-y-4 p-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-4 animate-pulse">
                <div className="h-12 w-12 rounded-xl bg-slate-200" />
                <div className="flex-1">
                  <div className="mb-2 h-4 w-1/3 rounded bg-slate-200" />
                  <div className="h-3 w-2/3 rounded bg-slate-200" />
                </div>
              </div>
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div className="py-12 text-center">
            <FiBell className="mx-auto mb-4 text-5xl text-lk-border" />
            <h3 className="mb-2 text-xl font-semibold text-lk-navy">No notifications</h3>
            <p className="text-lk-muted">You&apos;re all caught up.</p>
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="py-12 text-center text-sm text-lk-muted">No notifications in this category.</div>
        ) : (
          <div className="space-y-3 p-4 sm:p-5">
            {filteredNotifications.map((notification) => {
              const viewHref =
                normalizeActionUrl(notification.actionUrl, pathname) ??
                (pathname.startsWith('/lawyer')
                  ? '/lawyer/dashboard'
                  : pathname.startsWith('/client')
                    ? '/client/dashboard'
                    : '/admin');
              return (
                <div
                  key={notification._id}
                  className={`rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm transition-shadow sm:p-5 ${
                    !notification.isRead ? 'ring-1 ring-blue-100/90' : 'hover:shadow-md'
                  }`}
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 flex-1 gap-3 sm:gap-4">
                      <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 ring-1 ring-blue-100/80">
                        {getIcon(notification.type)}
                        {!notification.isRead ? (
                          <span
                            className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-lk-accent shadow-sm"
                            aria-label="Unread"
                          />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-2 gap-y-1">
                          <h4 className="font-semibold leading-snug text-lk-navy">{notification.title}</h4>
                          <time className="shrink-0 text-[11px] font-medium tabular-nums text-lk-muted">
                            {new Date(notification.createdAt).toLocaleString()}
                          </time>
                        </div>
                        <p className="mt-1.5 text-sm leading-relaxed text-lk-muted">{notification.message}</p>
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                      {notification.actionUrl && (
                        <Link to={viewHref}>
                          <Button size="sm" className="min-w-[4.5rem]">
                            View
                          </Button>
                        </Link>
                      )}
                      <Button size="sm" variant="danger" onClick={() => handleDeleteClick(notification)}>
                        Delete
                      </Button>
                      {!notification.isRead && (
                        <button
                          type="button"
                          onClick={() => handleMarkAsRead(notification._id)}
                          className="text-xs font-semibold text-lk-accent hover:underline"
                        >
                          Mark read
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Delete confirmation modal */}
      <Modal
        isOpen={deleteModalOpen}
        onClose={() => { setDeleteModalOpen(false); setNotificationToDelete(null); }}
        title="Delete Notification"
      >
        <div className="p-5 space-y-4">
          <p className="text-slate-600">
            Are you sure you want to delete this notification?
          </p>
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => { setDeleteModalOpen(false); setNotificationToDelete(null); }}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDeleteConfirm}>
              Delete
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
