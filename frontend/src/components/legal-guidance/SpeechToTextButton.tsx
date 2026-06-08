import { useEffect, useRef } from 'react';
import { FiMic, FiMicOff } from 'react-icons/fi';
import { useSpeechToText } from '../../hooks/useSpeechToText';

type Props = {
  language: string;
  value: string;
  onChange: (text: string) => void;
  disabled?: boolean;
  className?: string;
  onError?: (message: string | null) => void;
};

export function SpeechToTextButton({
  language,
  value,
  onChange,
  disabled,
  className = '',
  onError,
}: Props) {
  const prevValueRef = useRef(value);

  const { listening, supported, error, setError, toggle, stop } = useSpeechToText({
    language,
    onText: onChange,
    getBaseText: () => value,
  });

  useEffect(() => {
    onError?.(error);
  }, [error, onError]);

  useEffect(() => {
    const hadContent = prevValueRef.current.trim().length > 0;
    const nowEmpty = !value.trim();
    prevValueRef.current = value;
    if (hadContent && nowEmpty && listening) {
      stop({ skipFinalUpdate: true });
    }
  }, [value, listening, stop]);

  if (!supported) {
    return (
      <button
        type="button"
        disabled
        title="Voice input needs Chrome/Edge on localhost or HTTPS"
        aria-label="Voice input unavailable"
        className={`flex h-11 w-11 shrink-0 cursor-not-allowed items-center justify-center rounded-xl border border-slate-200 text-lk-muted opacity-40 ${className}`}
      >
        <FiMic className="text-lg" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setError(null);
        onError?.(null);
        toggle();
      }}
      disabled={disabled}
      title={listening ? 'Stop listening' : 'Speak your question (voice to text)'}
      aria-label={listening ? 'Stop voice input' : 'Start voice input'}
      aria-pressed={listening}
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition ${className} ${
        listening
          ? 'animate-pulse border-red-300 bg-red-50 text-red-600 ring-2 ring-red-200'
          : 'border-slate-200 text-lk-muted hover:border-lk-accent/40 hover:bg-blue-50 hover:text-lk-accent'
      } disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {listening ? <FiMicOff className="text-lg" /> : <FiMic className="text-lg" />}
    </button>
  );
}
