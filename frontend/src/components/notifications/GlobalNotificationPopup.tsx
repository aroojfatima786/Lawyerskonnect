import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { authStorage } from '../../utils/authStorage';
import { getApiBaseUrl } from '../../config/apiBase';

export default function GlobalNotificationPopup() {
  const socketRef = useRef<Socket | null>(null);
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const token = authStorage.getToken();
    if (!token) return;

    const socket = io(`${getApiBaseUrl()}/chat`, { auth: { token } });
    socketRef.current = socket;

    socket.on('notification', (notification: any) => {
      const id = String(notification?._id || notification?.id || '');
      if (id && seenRef.current.has(id)) return;
      if (id) seenRef.current.add(id);
      window.dispatchEvent(
        new CustomEvent('lk:new-notification', {
          detail: notification,
        }),
      );
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  return null;
}
