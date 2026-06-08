import React, { createContext, useContext, useState, useCallback } from 'react';
import { FiCheckCircle, FiAlertCircle, FiInfo, FiX } from 'react-icons/fi';

interface Toast {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  duration?: number;
}

interface ToastContextType {
  showToast: (type: Toast['type'], message: string, duration?: number) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  warning: (message: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (type: Toast['type'], message: string, duration = 4000) => {
      const id = Math.random().toString(36).substring(2);
      const toast: Toast = { id, type, message, duration };
      
      setToasts((prev) => [...prev, toast]);

      if (duration > 0) {
        setTimeout(() => removeToast(id), duration);
      }
    },
    [removeToast]
  );

  const value: ToastContextType = {
    showToast,
    success: (message) => showToast('success', message),
    error: (message) => showToast('error', message),
    info: (message) => showToast('info', message),
    warning: (message) => showToast('warning', message),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}

function ToastContainer({
  toasts,
  onRemove,
}: {
  toasts: Toast[];
  onRemove: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>
  );
}

function ToastItem({
  toast,
  onRemove,
}: {
  toast: Toast;
  onRemove: (id: string) => void;
}) {
  const config = {
    success: {
      icon: FiCheckCircle,
      bg: 'bg-green-50 border-green-200',
      text: 'text-green-800',
      iconColor: 'text-green-500',
    },
    error: {
      icon: FiAlertCircle,
      bg: 'bg-red-50 border-red-200',
      text: 'text-red-800',
      iconColor: 'text-red-500',
    },
    info: {
      icon: FiInfo,
      bg: 'bg-blue-50 border-blue-200',
      text: 'text-blue-800',
      iconColor: 'text-blue-500',
    },
    warning: {
      icon: FiAlertCircle,
      bg: 'bg-yellow-50 border-yellow-200',
      text: 'text-yellow-800',
      iconColor: 'text-yellow-500',
    },
  };

  const { icon: Icon, bg, text, iconColor } = config[toast.type];

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg min-w-[300px] max-w-md animate-in slide-in-from-right ${bg}`}
    >
      <Icon className={`flex-shrink-0 text-xl ${iconColor}`} />
      <p className={`flex-1 text-sm font-medium ${text}`}>{toast.message}</p>
      <button
        onClick={() => onRemove(toast.id)}
        className={`flex-shrink-0 p-1 rounded hover:bg-black/5 ${text}`}
      >
        <FiX />
      </button>
    </div>
  );
}
