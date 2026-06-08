import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { FiCopy, FiEdit2, FiTrash2 } from 'react-icons/fi';

const LONG_PRESS_MS = 450;

type MessageContextMenuProps = {
  messageId: string;
  isOwn: boolean;
  canEdit: boolean;
  canCopy: boolean;
  align: 'left' | 'right';
  children: ReactNode;
  openMessageId: string | null;
  onOpenChange: (messageId: string | null) => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onCopy?: () => void;
};

export function MessageContextMenu({
  messageId,
  isOwn,
  canEdit,
  canCopy,
  align,
  children,
  openMessageId,
  onOpenChange,
  onEdit,
  onDelete,
  onCopy,
}: MessageContextMenuProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const isOpen = openMessageId === messageId;

  const openMenu = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const menuWidth = 200;
    const left =
      align === 'right'
        ? Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8)
        : Math.max(8, rect.left);
    setMenuPos({ top: rect.top, left });
    onOpenChange(messageId);
  }, [align, messageId, onOpenChange]);

  const closeMenu = useCallback(() => {
    onOpenChange(null);
    setMenuPos(null);
  }, [onOpenChange]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, closeMenu]);

  const clearLongPress = () => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    if (!isOwn && !canCopy) return;
    e.preventDefault();
    openMenu();
  };

  const handleTouchStart = () => {
    if (!isOwn && !canCopy) return;
    clearLongPress();
    longPressRef.current = setTimeout(() => openMenu(), LONG_PRESS_MS);
  };

  const handleTouchEnd = () => clearLongPress();

  const runAction = (action: () => void) => {
    closeMenu();
    action();
  };

  const showMenu = isOpen && menuPos && (isOwn || canCopy);

  return (
    <>
      <div
        ref={wrapRef}
        className={`relative max-w-full ${isOwn ? 'cursor-pointer' : canCopy ? 'cursor-pointer' : ''}`}
        onContextMenu={handleContextMenu}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        {children}
        {isOwn && (
          <button
            type="button"
            className="absolute -left-7 top-1/2 hidden h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-lk-navy shadow-md ring-1 ring-slate-200/90 transition group-hover:flex sm:flex opacity-0 group-hover:opacity-100 [.group:hover_&]:opacity-100"
            aria-label="Message options"
            onClick={(e) => {
              e.stopPropagation();
              if (isOpen) closeMenu();
              else openMenu();
            }}
          >
            <span className="text-xs font-bold leading-none">▼</span>
          </button>
        )}
      </div>

      {showMenu &&
        createPortal(
          <>
            <button
              type="button"
              className="fixed inset-0 z-[200] cursor-default bg-black/20"
              aria-label="Close menu"
              onClick={closeMenu}
            />
            <div
              className="fixed z-[201] min-w-[200px] -translate-y-[calc(100%+8px)] overflow-hidden rounded-xl bg-white py-1.5 shadow-2xl ring-1 ring-slate-200/90"
              style={{ top: menuPos.top, left: menuPos.left }}
              role="menu"
            >
              {canCopy && onCopy ? (
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[15px] text-lk-navy hover:bg-slate-50"
                  onClick={() => runAction(onCopy)}
                >
                  <FiCopy className="text-lg text-lk-muted" aria-hidden />
                  Copy
                </button>
              ) : null}
              {isOwn && canEdit && onEdit ? (
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[15px] text-lk-navy hover:bg-slate-50"
                  onClick={() => runAction(onEdit)}
                >
                  <FiEdit2 className="text-lg text-lk-muted" aria-hidden />
                  Edit
                </button>
              ) : null}
              {isOwn && onDelete ? (
                <>
                  {(canCopy || canEdit) && <div className="my-1 border-t border-slate-100" />}
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[15px] text-red-600 hover:bg-red-50"
                    onClick={() => runAction(onDelete)}
                  >
                    <FiTrash2 className="text-lg" aria-hidden />
                    Delete
                  </button>
                </>
              ) : null}
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
