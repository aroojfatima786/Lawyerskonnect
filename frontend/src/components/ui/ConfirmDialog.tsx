import { useEffect } from 'react';
import { Button } from './Button';

export type ConfirmDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
  isLoading?: boolean;
};

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  isLoading = false,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', onKey);
    };
  }, [isOpen, isLoading, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[250]" role="presentation">
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-black/50 backdrop-blur-sm"
        aria-label="Close dialog"
        disabled={isLoading}
        onClick={() => {
          if (!isLoading) onClose();
        }}
      />
      <div className="relative flex h-full items-center justify-center p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
          className="w-full max-w-md rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200/90"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-6 pt-6">
            <h2 id="confirm-dialog-title" className="text-lg font-bold text-lk-navy">
              {title}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-lk-muted">{message}</p>
          </div>
          <div className="flex flex-col-reverse gap-2 px-6 pb-6 pt-5 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
              {cancelLabel}
            </Button>
            <Button
              type="button"
              variant={variant === 'danger' ? 'danger' : 'primary'}
              onClick={() => void onConfirm()}
              isLoading={isLoading}
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
