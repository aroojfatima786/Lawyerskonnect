import { useEffect, useRef } from 'react';
import { FiCpu, FiSend, FiSettings, FiUploadCloud } from 'react-icons/fi';
import { Footer, Navbar } from '../../components/layouts';
import { MAX_KYC_FILE_LABEL } from '../../constants/uploadLimits';
import type { Language } from './LegalGuidance';
import { GuidanceErrorBanner, LimitedModeBadge, SUGGESTED_PROMPT_CARDS, type SuggestedPromptCard } from './legalGuidanceShared';

type ChatTurn = {
  id: string;
  role: 'user' | 'assistant';
  text?: string;
  fileName?: string;
  result?: any;
  isError?: boolean;
};

export function LegalGuidancePublicView({
  language,
  setLanguage,
  languageOptions,
  location,
  setLocation,
  preferredPracticeArea,
  setPreferredPracticeArea,
  practiceAreaOptions,
  message,
  setMessage,
  selectedFile,
  setSelectedFile,
  loading,
  showOptions,
  setShowOptions,
  chatTurns,
  history,
  historyLoading,
  onSubmit,
  handleFileChange,
  GuidanceResults,
  user,
  applySuggestedPrompt,
}: {
  language: Language;
  setLanguage: (v: Language) => void;
  languageOptions: Array<{ value: Language; label: string }>;
  location: string;
  setLocation: (v: string) => void;
  preferredPracticeArea: string;
  setPreferredPracticeArea: (v: string) => void;
  practiceAreaOptions: string[];
  message: string;
  setMessage: (v: string) => void;
  selectedFile: File | null;
  setSelectedFile: (f: File | null) => void;
  loading: boolean;
  showOptions: boolean;
  setShowOptions: (fn: (o: boolean) => boolean) => void;
  chatTurns: ChatTurn[];
  history: any[];
  historyLoading: boolean;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  GuidanceResults: React.ComponentType<{ result: any; variant: 'dashboard' | 'public' }>;
  user: { _id?: string; role?: string } | null;
  applySuggestedPrompt: (card: SuggestedPromptCard) => void;
}) {
  const chatScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [chatTurns, loading]);

  const showSuggestedPrompts = !loading && chatTurns.length <= 1;

  return (
    <div className="min-h-screen overflow-x-hidden bg-gradient-to-b from-slate-100 via-white to-slate-100">
      <Navbar />
      <main className="lk-page-wide py-10 sm:py-14">
        <div className="mx-auto max-w-3xl text-center">
          <p className="public-kicker mb-3">Your legal journey, simplified</p>
          <h1 className="font-serif text-3xl font-bold tracking-tight text-lk-navy sm:text-4xl">AI Legal Guidance</h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-lk-muted sm:text-base">
            Get quick legal direction before booking a consultation — clear guidance on Pakistani law and verified lawyer matches across Pakistan.
          </p>
        </div>

        <div className="mx-auto mt-8 max-w-4xl">
          <div className="overflow-hidden rounded-3xl border border-slate-200/90 bg-white shadow-2xl shadow-slate-900/10 ring-1 ring-slate-100/90">
            <div className="border-b border-slate-200/90 bg-gradient-to-r from-lk-navy via-[#152a4a] to-[#1e3a8f] px-4 py-4 sm:px-6 sm:py-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20">
                    <FiCpu className="text-xl text-cyan-200" />
                  </div>
                  <div>
                    <h2 className="font-serif text-lg font-semibold text-white sm:text-xl">AI Legal Guidance Assistant</h2>
                    <p className="mt-1 max-w-xl text-xs leading-relaxed text-white/80 sm:text-sm">
                      Initial legal direction and verified lawyer suggestions — before you book a consultation.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div
              ref={chatScrollRef}
              className="lk-scroll-elegant max-h-[min(52vh,520px)] min-h-[320px] space-y-4 overflow-y-auto bg-gradient-to-b from-[#eef4fb] via-[#f4f8fc] to-slate-50 p-4 sm:p-5"
            >
              {chatTurns.map((turn) =>
                turn.role === 'user' ? (
                  <div key={turn.id} className="flex justify-end lk-chat-bubble-in">
                    <div className="max-w-[min(100%,28rem)] rounded-2xl rounded-br-md border border-blue-100/80 bg-white px-4 py-3 text-sm leading-relaxed text-lk-navy shadow-md ring-1 ring-slate-100/90">
                      <p className="whitespace-pre-wrap">{turn.text}</p>
                      {turn.fileName ? <p className="mt-2 text-[11px] font-medium text-lk-muted">📎 {turn.fileName}</p> : null}
                    </div>
                  </div>
                ) : turn.isError ? (
                  <div key={turn.id} className="flex justify-start lk-chat-bubble-in">
                    <div className="max-w-[min(100%,32rem)]">
                      <GuidanceErrorBanner message={turn.text || 'Something went wrong. Please try again.'} />
                    </div>
                  </div>
                ) : turn.result?.success ? (
                  <div key={turn.id} className="flex justify-start lk-chat-bubble-in">
                    <div className="max-w-[min(100%,32rem)] rounded-2xl rounded-bl-md border border-slate-200/90 bg-white px-4 py-3 shadow-md ring-1 ring-slate-100/90 sm:px-5 sm:py-4">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-lk-navy to-lk-accent text-white">
                          <FiCpu className="text-sm" />
                        </div>
                        <span className="text-xs font-semibold text-lk-navy">Legal Guidance</span>
                        {turn.result.limitedMode && <LimitedModeBadge />}
                      </div>
                      <GuidanceResults result={turn.result} variant="public" />
                    </div>
                  </div>
                ) : (
                  <div key={turn.id} className="flex justify-start lk-chat-bubble-in">
                    <div className="max-w-[min(100%,28rem)] rounded-2xl rounded-bl-md border border-slate-200/90 bg-white px-4 py-3 text-sm leading-relaxed text-lk-navy shadow-md ring-1 ring-slate-100/90">
                      <p className="whitespace-pre-wrap">{turn.text}</p>
                    </div>
                  </div>
                ),
              )}
              {loading ? (
                <div className="flex justify-start">
                  <div className="rounded-2xl rounded-bl-md border border-slate-200/90 bg-white px-4 py-3 shadow-sm ring-1 ring-slate-100">
                    <div className="flex items-center gap-2 text-sm text-lk-muted">
                      <span className="flex gap-1">
                        <span className="h-2 w-2 animate-bounce rounded-full bg-lk-accent [animation-delay:0ms]" />
                        <span className="h-2 w-2 animate-bounce rounded-full bg-lk-accent [animation-delay:150ms]" />
                        <span className="h-2 w-2 animate-bounce rounded-full bg-lk-accent [animation-delay:300ms]" />
                      </span>
                      Analyzing your legal issue…
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            {showSuggestedPrompts ? (
              <div className="border-t border-slate-200/80 bg-white/95 px-4 py-3 sm:px-5">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-lk-muted">Suggested prompts</p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTED_PROMPT_CARDS.map((card) => (
                    <button
                      key={card.label}
                      type="button"
                      onClick={() => applySuggestedPrompt(card)}
                      className="rounded-full border border-slate-200/90 bg-slate-50 px-3 py-1.5 text-left text-xs font-medium text-lk-navy transition hover:border-lk-accent/40 hover:bg-blue-50 hover:text-lk-accent"
                    >
                      {card.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="border-t border-slate-200/90 bg-white p-4 sm:p-5">
              <form onSubmit={onSubmit} className="flex flex-col gap-3">
                <div className="flex items-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowOptions((o) => !o)}
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition ${
                      showOptions ? 'border-lk-accent bg-blue-50 text-lk-accent' : 'border-slate-200 text-lk-muted hover:bg-slate-50'
                    }`}
                    aria-label="Options"
                  >
                    <FiSettings />
                  </button>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={2}
                    placeholder="Describe your legal issue…"
                    className="min-h-[48px] flex-1 resize-none rounded-2xl border border-slate-200/90 bg-slate-50/50 px-4 py-3 text-sm leading-relaxed text-lk-navy placeholder:text-lk-muted focus:border-lk-accent focus:bg-white focus:outline-none focus:ring-2 focus:ring-lk-accent/25"
                    disabled={loading}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        e.currentTarget.form?.requestSubmit();
                      }
                    }}
                  />
                  <button
                    type="submit"
                    disabled={loading || (!message.trim() && !selectedFile)}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-lk-accent text-white shadow-lg shadow-lk-accent/30 transition hover:bg-blue-700 disabled:opacity-50"
                    aria-label="Send"
                  >
                    <FiSend className="text-lg" />
                  </button>
                </div>
                {showOptions ? (
                  <div className="space-y-3 rounded-2xl border border-slate-200/90 bg-slate-50/80 p-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <label className="text-xs">
                        <span className="mb-1 block font-semibold text-lk-navy">Language</span>
                        <select
                          value={language}
                          onChange={(e) => setLanguage(e.target.value as Language)}
                          className="min-h-[40px] w-full rounded-xl border border-lk-border bg-white px-3 text-sm"
                        >
                          {languageOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs">
                        <span className="mb-1 block font-semibold text-lk-navy">City (optional)</span>
                        <input
                          value={location}
                          onChange={(e) => setLocation(e.target.value)}
                          placeholder="e.g. Lahore"
                          className="min-h-[40px] w-full rounded-xl border border-lk-border bg-white px-3 text-sm"
                        />
                      </label>
                    </div>
                    <label className="block text-xs">
                      <span className="mb-1 block font-semibold text-lk-navy">Practice area (optional)</span>
                      <input
                        list="practice-area-options-public"
                        value={preferredPracticeArea}
                        onChange={(e) => setPreferredPracticeArea(e.target.value)}
                        className="min-h-[40px] w-full rounded-xl border border-lk-border bg-white px-3 text-sm"
                      />
                      <datalist id="practice-area-options-public">
                        {practiceAreaOptions.map((opt) => (
                          <option key={opt} value={opt} />
                        ))}
                      </datalist>
                    </label>
                    <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-lk-border bg-white px-3 py-3 text-xs text-lk-muted hover:border-lk-accent/40">
                      <FiUploadCloud className="text-lk-accent" />
                      Upload TXT/PDF/DOC (max {MAX_KYC_FILE_LABEL})
                      <input type="file" accept=".txt,.pdf,.doc,.docx" className="hidden" onChange={handleFileChange} />
                    </label>
                    {selectedFile ? (
                      <p className="text-xs text-lk-muted">
                        Attached: <span className="font-medium text-lk-navy">{selectedFile.name}</span>
                        <button type="button" className="ml-2 font-semibold text-lk-danger" onClick={() => setSelectedFile(null)}>
                          Remove
                        </button>
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </form>
              <p className="mt-3 text-center text-[10px] leading-relaxed text-lk-muted">
                AI guidance helps you understand your options. For case-specific action, consult a verified lawyer.
              </p>
            </div>
          </div>
        </div>

        <div className="mx-auto mt-10 max-w-4xl rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm ring-1 ring-slate-100/80 sm:p-6">
          <h2 className="text-sm font-semibold text-lk-navy">Recent sessions</h2>
          {!user ? (
            <p className="mt-3 text-sm text-lk-muted">Sign in to save and revisit your guidance history across devices.</p>
          ) : historyLoading ? (
            <p className="mt-3 text-sm text-lk-muted">Loading…</p>
          ) : history.length === 0 ? (
            <p className="mt-3 text-sm text-lk-muted">Your guidance history will appear here after your first question.</p>
          ) : (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {history.slice(0, 6).map((item: any) => (
                <div key={item._id} className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5">
                  <p className="line-clamp-2 text-xs font-medium text-lk-navy">{item.question}</p>
                  <p className="mt-1 text-[10px] text-lk-muted">{new Date(item.createdAt).toLocaleString()}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
