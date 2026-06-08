import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaCommentDots, FaTimes } from 'react-icons/fa';
import { SpeechToTextButton } from '../legal-guidance/SpeechToTextButton';

const DRAFT_KEY = 'lk-guidance-auto';

export function AIChatbotWidget() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [askInput, setAskInput] = useState('');
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const handleGetGuidance = () => {
    const trimmed = askInput.trim();
    if (trimmed) {
      sessionStorage.setItem(DRAFT_KEY, trimmed);
    } else {
      sessionStorage.removeItem(DRAFT_KEY);
    }
    setOpen(false);
    navigate('/client/legal-guidance');
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-lk-accent text-xl text-white shadow-lg shadow-lk-accent/35 transition-transform hover:scale-105 hover:bg-blue-600"
        aria-label="Open AI Legal Guidance"
      >
        <FaCommentDots />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30" aria-hidden onClick={() => setOpen(false)} />
          <div
            className="fixed bottom-24 right-6 z-50 w-[360px] max-w-[calc(100vw-3rem)] overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xl"
            role="dialog"
            aria-label="AI Legal Guidance"
          >
            <div className="flex items-center justify-between border-b border-white/10 bg-gradient-to-r from-[#163b63] to-[#1e5278] px-4 py-3 text-white">
              <div>
                <p className="font-bold">AI Legal Guidance</p>
                <p className="text-xs text-white/80">Describe your issue — get guidance on the full page.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-2 hover:bg-white/10">
                <FaTimes />
              </button>
            </div>

            <div className="space-y-3 p-4">
              <div className="flex items-end gap-2">
                <textarea
                  value={askInput}
                  onChange={(e) => {
                    setVoiceError(null);
                    setAskInput(e.target.value);
                  }}
                  rows={4}
                  placeholder="Describe your legal issue… or use mic"
                  className="min-h-[88px] flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-lk-navy placeholder:text-lk-muted focus:border-lk-accent focus:outline-none focus:ring-2 focus:ring-lk-accent/25"
                />
                <SpeechToTextButton
                  language="english"
                  value={askInput}
                  onChange={setAskInput}
                  onError={setVoiceError}
                />
              </div>
              {voiceError ? <p className="text-[10px] text-red-600">{voiceError}</p> : null}
              <button
                type="button"
                onClick={handleGetGuidance}
                className="min-h-[44px] w-full rounded-xl bg-lk-accent px-3 py-2.5 text-sm font-semibold text-white shadow-md shadow-lk-accent/20 hover:bg-blue-600"
              >
                Get guidance
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

export const LEGAL_GUIDANCE_DRAFT_KEY = DRAFT_KEY;
