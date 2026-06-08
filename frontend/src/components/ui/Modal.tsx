import React, { useEffect } from 'react';
import { FiX } from 'react-icons/fi';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  showCloseButton?: boolean;
}

export function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  size = 'md',
  showCloseButton = true,
}: ModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    full: 'max-w-4xl',
  };

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative h-full w-full flex items-center justify-center p-4">
        <div
          className={`w-full ${sizeClasses[size]} bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200`}
        >
          {/* Header */}
          {(title || showCloseButton) && (
            <div className="relative bg-[#163b63] px-6 py-5 text-white">
              {title && (
                <>
                  <h2 className="text-xl font-bold pr-10">{title}</h2>
                  {subtitle && (
                    <p className="text-white/80 text-sm mt-1">{subtitle}</p>
                  )}
                </>
              )}
              {showCloseButton && (
                <button
                  onClick={onClose}
                  className="absolute right-4 top-4 h-10 w-10 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors"
                  aria-label="Close"
                >
                  <FiX size={22} />
                </button>
              )}
            </div>
          )}

          {/* Content */}
          <div className="max-h-[calc(100vh-200px)] overflow-auto">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
