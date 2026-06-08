import { useRef, useEffect, useState, type FormEvent } from 'react';
import {
  FiCpu,
  FiSend,
  FiPlus,
  FiMenu,
  FiX,
  FiPaperclip,
  FiMessageSquare,
  FiTrash2,
  FiMapPin,
} from 'react-icons/fi';
import { Navbar } from '../layouts';
import {
  SUGGESTED_PROMPT_CARDS,
  GuidanceErrorBanner,
  type SuggestedPromptCard,
} from '../../pages/legal-guidance/legalGuidanceShared';
import { GuidanceMessage, UserChatBubble } from './GuidanceMessage';
import { normalizeLegalChatPayload } from './formatLegalResponse';
import { MAX_KYC_FILE_LABEL } from '../../constants/uploadLimits';
import type { Language } from '../../pages/legal-guidance/LegalGuidance';
import { SpeechToTextButton } from './SpeechToTextButton';
import { ConfirmDialog } from '../ui/ConfirmDialog';

export type GuidanceChatTurn = {
  id: string;
  role: 'user' | 'assistant';
  text?: string;
  fileName?: string;
  result?: any;
  isError?: boolean;
};

export type GuidanceSessionMeta = {
  id: string;
  title: string;
  updatedAt: number;
};

export const WELCOME_TURN: GuidanceChatTurn = {
  id: 'welcome',
  role: 'assistant',
  text: 'Describe your legal issue in simple words. I can provide initial guidance and suggest verified lawyer categories before you book.',
};

export function LegalGuidanceShell({
  variant,
  chatTurns,
  loading,
  message,
  setMessage,
  selectedFile,
  setSelectedFile,
  language,
  setLanguage: _setLanguage,
  languageOptions: _languageOptions,
  onSubmit,
  onFileChange,
  applySuggestedPrompt,
  sessions,
  activeSessionId,
  onNewChat,
  onSelectSession,
  onDeleteSession,
  serverHistory,
  historyLoading,
  userLoggedIn,
  location = '',
  setLocation,
  onDetectLocation,
  locationDetecting = false,
  locationError,
  maxBudget = '',
  setMaxBudget,
}: {
  variant: 'public' | 'dashboard';
  chatTurns: GuidanceChatTurn[];
  loading: boolean;
  message: string;
  setMessage: (v: string) => void;
  selectedFile: File | null;
  setSelectedFile: (f: File | null) => void;
  language: Language;
  setLanguage: (v: Language) => void;
  languageOptions: Array<{ value: Language; label: string }>;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  applySuggestedPrompt: (card: SuggestedPromptCard) => void;
  sessions: GuidanceSessionMeta[];
  activeSessionId: string | null;
  onNewChat: () => void;
  onSelectSession: (id: string) => void;
  onDeleteSession?: (id: string) => void;
  serverHistory: any[];
  historyLoading: boolean;
  userLoggedIn: boolean;
  location?: string;
  setLocation?: (value: string) => void;
  onDetectLocation?: () => void;
  locationDetecting?: boolean;
  locationError?: string | null;
  maxBudget?: string;
  setMaxBudget?: (value: string) => void;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [pendingDeleteSessionId, setPendingDeleteSessionId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isPublic = variant === 'public';
  const showIntro = chatTurns.length <= 1 && !loading;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [chatTurns, loading]);

  useEffect(() => {
    if (!isPublic) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isPublic]);

  const sidebar = (
    <aside
      className={`flex w-full shrink-0 flex-col border-slate-200/90 bg-gradient-to-br from-lk-navy via-[#0f172a] to-[#1e3a8f] text-white md:w-[280px] md:border-r md:border-l-0 ${
        sidebarOpen ? 'fixed inset-y-0 left-0 z-50 w-[min(100vw,300px)] shadow-2xl md:relative' : 'hidden md:flex'
      }`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15">
            <FiCpu className="text-cyan-200" />
          </div>
          <span className="text-sm font-semibold">Legal Guidance</span>
        </div>
        <button
          type="button"
          className="rounded-lg p-2 text-white/70 hover:bg-white/10 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close sidebar"
        >
          <FiX />
        </button>
      </div>

      <div className="p-3">
        <button
          type="button"
          onClick={() => {
            onNewChat();
            setSidebarOpen(false);
          }}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-2.5 text-sm font-semibold transition hover:bg-white/15"
        >
          <FiPlus /> New chat
        </button>
      </div>

      <div className="lk-scroll-elegant min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-wider text-white/45">This device</p>
        {sessions.length === 0 ? (
          <p className="px-2 text-xs text-white/50">No chats yet — tap New chat.</p>
        ) : (
          <ul className="space-y-1">
            {sessions.map((s) => (
              <li key={s.id} className="group relative">
                <button
                  type="button"
                  onClick={() => {
                    onSelectSession(s.id);
                    setSidebarOpen(false);
                  }}
                  className={`flex w-full items-start gap-2 rounded-lg px-3 py-2.5 pr-9 text-left text-sm transition ${
                    s.id === activeSessionId
                      ? 'bg-white/15 text-white ring-1 ring-white/20'
                      : 'text-white/75 hover:bg-white/8'
                  }`}
                >
                  <FiMessageSquare className="mt-0.5 shrink-0 opacity-70" />
                  <span className="line-clamp-2 min-w-0 flex-1 font-medium">{s.title}</span>
                </button>
                {onDeleteSession ? (
                  <button
                    type="button"
                    title="Remove chat"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPendingDeleteSessionId(s.id);
                    }}
                    className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-white/50 opacity-0 transition hover:bg-white/15 hover:text-red-300 group-hover:opacity-100"
                  >
                    <FiTrash2 className="text-sm" />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {userLoggedIn ? (
          <>
            <p className="mb-2 mt-5 px-2 text-[10px] font-semibold uppercase tracking-wider text-white/45">Saved history</p>
            {historyLoading ? (
              <p className="px-2 text-xs text-white/50">Loading…</p>
            ) : serverHistory.length === 0 ? (
              <p className="px-2 text-xs text-white/50">No saved sessions yet.</p>
            ) : (
              <ul className="space-y-1">
                {serverHistory.slice(0, 8).map((item: any) => (
                  <li key={item._id} className="rounded-lg px-3 py-2 text-xs text-white/65">
                    <p className="line-clamp-2 font-medium text-white/85">{item.question}</p>
                    <p className="mt-1 text-[10px] text-white/40">{new Date(item.createdAt).toLocaleDateString()}</p>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="mt-5 px-2 text-xs leading-relaxed text-white/45">Sign in to save history across devices.</p>
        )}
      </div>
    </aside>
  );

  const main = (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-gradient-to-b from-[#eef2f9] via-[#f4f7fc] to-[#e8edf5]">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200/90 bg-white/95 px-4 py-3 backdrop-blur-sm sm:px-5">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-200 p-2 text-lk-navy md:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open chat history"
          >
            <FiMenu />
          </button>
          <div>
            <h1 className="truncate text-base font-bold text-lk-navy sm:text-lg">AI Legal Guidance</h1>
          </div>
        </div>
      </header>

      <div ref={scrollRef} className="lk-scroll-elegant flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-5 sm:px-6">
        {showIntro ? (
          <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center py-6 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-lk-navy to-lk-accent text-white shadow-lg shadow-lk-navy/20">
              <FiCpu className="text-2xl" />
            </div>
            <h2 className="font-serif text-2xl font-bold text-lk-navy">AI Legal Guidance</h2>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-lk-muted">Describe your legal issue in simple words.</p>
            <p className="mt-1 max-w-md text-sm leading-relaxed text-lk-muted">
              Get initial guidance and suggested lawyer categories before booking.
            </p>
            <div className="mt-8 grid w-full max-w-xl grid-cols-1 gap-2 sm:grid-cols-2">
              {SUGGESTED_PROMPT_CARDS.map((card) => (
                <button
                  key={card.label}
                  type="button"
                  onClick={() => applySuggestedPrompt(card)}
                  className="lk-card-lift rounded-xl border border-slate-200/90 bg-white px-4 py-3 text-left text-sm font-medium text-lk-navy shadow-sm ring-1 ring-slate-100/80 hover:border-lk-accent/30"
                >
                  {card.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-4">
            {chatTurns.map((turn) => {
              if (turn.role === 'user') {
                return (
                  <div key={turn.id} className="flex justify-end">
                    <div className="max-w-[min(100%,32rem)] rounded-2xl rounded-br-md bg-gradient-to-br from-lk-navy to-[#1e3a8f] px-4 py-3 text-white shadow-md">
                      <UserChatBubble text={turn.text} fileName={turn.fileName} />
                    </div>
                  </div>
                );
              }
              if (turn.isError) {
                return (
                  <div key={turn.id} className="flex justify-start">
                    <div className="max-w-[min(100%,32rem)]">
                      <GuidanceErrorBanner message={turn.text || 'Something went wrong. Please try again.'} />
                    </div>
                  </div>
                );
              }
              if (turn.result && normalizeLegalChatPayload(turn.result)?.answer) {
                return (
                  <div key={turn.id} className="flex justify-start gap-3">
                    <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-lk-accent/10 text-lk-accent ring-1 ring-lk-accent/15">
                      <FiCpu className="text-sm" />
                    </div>
                    <div className="min-w-0 max-w-[min(100%,42rem)] flex-1 rounded-2xl rounded-tl-md border border-slate-200/90 bg-white px-4 py-4 shadow-sm ring-1 ring-slate-100/90 sm:px-5">
                      <GuidanceMessage result={turn.result} />
                    </div>
                  </div>
                );
              }
              if (turn.id === 'welcome') return null;
              return (
                <div key={turn.id} className="flex justify-start">
                  <div className="max-w-[min(100%,28rem)] rounded-2xl rounded-bl-md border border-slate-200/90 bg-white px-4 py-3 text-sm text-lk-navy shadow-sm">
                    <p className="whitespace-pre-wrap">{turn.text}</p>
                  </div>
                </div>
              );
            })}
            {loading ? (
              <div className="flex justify-start gap-3">
                <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-lk-accent/10 text-lk-accent">
                  <FiCpu className="text-sm" />
                </div>
                <div className="rounded-2xl rounded-tl-md border border-slate-200/90 bg-white px-4 py-3 shadow-sm">
                  <div className="flex items-center gap-2 text-sm text-lk-muted">
                    <span className="flex gap-1">
                      <span className="h-2 w-2 animate-bounce rounded-full bg-lk-accent [animation-delay:0ms]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-lk-accent [animation-delay:150ms]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-lk-accent [animation-delay:300ms]" />
                    </span>
                    Thinking…
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <form onSubmit={onSubmit} className="shrink-0 border-t border-slate-200/90 bg-white/95 px-4 py-3 backdrop-blur-sm sm:px-5 sm:py-4">
        {optionsOpen ? (
          <div className="mx-auto mb-3 max-w-3xl space-y-3 rounded-xl border border-slate-200/90 bg-slate-50/90 p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <label className="flex-1 text-xs">
                <span className="mb-1 block font-semibold text-lk-navy">Your city (for nearby lawyer suggestions)</span>
                <input
                  value={location}
                  onChange={(e) => setLocation?.(e.target.value)}
                  placeholder="e.g. Lahore, Karachi"
                  className="min-h-[40px] w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-lk-navy"
                />
              </label>
              <button
                type="button"
                onClick={onDetectLocation}
                disabled={locationDetecting}
                className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-lk-navy transition hover:border-lk-accent/40 hover:bg-blue-50 disabled:opacity-60"
              >
                <FiMapPin className="shrink-0" />
                {locationDetecting ? 'Detecting…' : 'Use my location'}
              </button>
            </div>
            {locationError ? <p className="text-center text-[10px] text-red-600">{locationError}</p> : null}
            <label className="text-xs">
              <span className="mb-1 block font-semibold text-lk-navy">Max consultation budget (PKR, optional)</span>
              <input
                type="number"
                min={0}
                step={500}
                value={maxBudget}
                onChange={(e) => setMaxBudget?.(e.target.value)}
                placeholder="e.g. 3000 — or say budget kam hai in chat"
                className="min-h-[40px] w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-lk-navy"
              />
            </label>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2.5 text-xs text-lk-muted hover:border-lk-accent/40">
              <FiPaperclip className="text-lk-accent" />
              Attach document (TXT/PDF/DOC, max {MAX_KYC_FILE_LABEL})
              <input type="file" accept=".txt,.pdf,.doc,.docx" className="hidden" onChange={onFileChange} />
            </label>
            {selectedFile ? (
              <p className="mt-2 text-center text-xs text-lk-muted">
                {selectedFile.name}{' '}
                <button type="button" className="font-semibold text-lk-danger" onClick={() => setSelectedFile(null)}>
                  Remove
                </button>
              </p>
            ) : null}
          </div>
        ) : null}
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <button
            type="button"
            onClick={() => setOptionsOpen((o) => !o)}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition ${
              optionsOpen ? 'border-lk-accent bg-blue-50 text-lk-accent' : 'border-slate-200 text-lk-muted hover:bg-slate-50'
            }`}
            aria-label="Attach file"
          >
            <FiPaperclip />
          </button>
          <textarea
            value={message}
            onChange={(e) => {
              setVoiceError(null);
              setMessage(e.target.value);
            }}
            rows={1}
            placeholder="Describe your legal issue… (or tap mic to speak)"
            disabled={loading}
            className="max-h-32 min-h-[44px] flex-1 resize-none rounded-2xl border border-slate-200/90 bg-slate-50/80 px-4 py-3 text-sm text-lk-navy placeholder:text-lk-muted focus:border-lk-accent focus:bg-white focus:outline-none focus:ring-2 focus:ring-lk-accent/25"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <SpeechToTextButton
            language={language}
            value={message}
            onChange={setMessage}
            disabled={loading}
            onError={setVoiceError}
          />
          <button
            type="submit"
            disabled={loading || (!message.trim() && !selectedFile)}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-lk-accent text-white shadow-lg shadow-lk-accent/25 transition hover:bg-blue-700 disabled:opacity-50"
            aria-label="Send"
          >
            <FiSend className="text-lg" />
          </button>
        </div>
        {voiceError ? (
          <p className="mx-auto mt-2 max-w-3xl text-center text-[10px] text-red-600">{voiceError}</p>
        ) : null}
        <p className="mx-auto mt-2 max-w-3xl text-center text-[10px] text-lk-muted">
          AI responses are for initial guidance only. For final legal decisions, please consult a verified lawyer.
          {' '}
          Voice input works best in Chrome/Edge (allow microphone when prompted).
        </p>
      </form>
    </div>
  );

  const layout = (
    <div className={`flex min-h-0 flex-1 flex-col overflow-hidden ${isPublic ? 'h-full' : 'h-[100dvh] max-h-[100dvh] w-full'}`}>
      <div className="relative flex min-h-0 flex-1 overflow-hidden md:grid md:grid-cols-[280px_minmax(0,1fr)]" dir="ltr">
        {sidebarOpen ? (
          <button
            type="button"
            className="fixed inset-0 z-40 bg-lk-navy/50 md:hidden"
            aria-label="Close overlay"
            onClick={() => setSidebarOpen(false)}
          />
        ) : null}
        {sidebar}
        {main}
      </div>
    </div>
  );

  const removeChatDialog = (
    <ConfirmDialog
      isOpen={pendingDeleteSessionId !== null}
      onClose={() => {
        if (!deleteLoading) setPendingDeleteSessionId(null);
      }}
      onConfirm={async () => {
        if (!pendingDeleteSessionId || !onDeleteSession) return;
        setDeleteLoading(true);
        try {
          await onDeleteSession(pendingDeleteSessionId);
          setPendingDeleteSessionId(null);
        } finally {
          setDeleteLoading(false);
        }
      }}
      title="Remove chat from list?"
      message="This chat will be removed from this device. You can start a new chat anytime from AI Legal Guidance."
      confirmLabel="Remove"
      cancelLabel="Cancel"
      variant="danger"
      isLoading={deleteLoading}
    />
  );

  if (isPublic) {
    return (
      <>
        <div className="flex h-[100dvh] flex-col overflow-hidden">
          <Navbar />
          <main className="flex min-h-0 flex-1 flex-col overflow-hidden">{layout}</main>
        </div>
        {removeChatDialog}
      </>
    );
  }

  return (
    <>
      {layout}
      {removeChatDialog}
    </>
  );
}
