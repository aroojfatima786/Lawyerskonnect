import { useCallback, useEffect, useRef, useState } from 'react';

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      0: { transcript: string };
    };
  };
};

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function mapGuidanceLanguageToSpeechLang(language: string): string {
  if (language === 'urdu') return 'ur-PK';
  if (language === 'roman_urdu') return 'en-PK';
  return 'en-PK';
}

function isSecureMicContext(): boolean {
  if (typeof window === 'undefined') return false;
  return window.isSecureContext === true;
}

export function useSpeechToText(options: {
  language: string;
  onText: (text: string) => void;
  getBaseText?: () => string;
}) {
  const { language, onText, getBaseText } = options;
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const prefixRef = useRef('');
  const finalRef = useRef('');

  useEffect(() => {
    setSupported(Boolean(getSpeechRecognitionCtor()) && isSecureMicContext());
    return () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    };
  }, []);

  const stop = useCallback((options?: { skipFinalUpdate?: boolean }) => {
    const recognition = recognitionRef.current;
    if (!recognition) {
      setListening(false);
      return;
    }
    recognition.onend = null;
    recognition.onresult = null;
    if (options?.skipFinalUpdate) {
      recognition.abort();
    } else {
      recognition.stop();
    }
    recognitionRef.current = null;
    setListening(false);
  }, []);

  const start = useCallback(async () => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setError('Voice input is not supported in this browser. Try Chrome or Edge.');
      return;
    }
    if (!isSecureMicContext()) {
      setError('Microphone needs a secure connection. Open the app via https:// or http://localhost.');
      return;
    }

    setError(null);
    prefixRef.current = (getBaseText?.() || '').trim();
    if (prefixRef.current && !prefixRef.current.endsWith(' ')) {
      prefixRef.current += ' ';
    }
    finalRef.current = '';

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
    } catch {
      setError('Microphone permission denied. Allow mic access in browser settings.');
      return;
    }

    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = mapGuidanceLanguageToSpeechLang(language);
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const piece = result[0]?.transcript || '';
        if (result.isFinal) {
          finalRef.current += piece;
        } else {
          interim += piece;
        }
      }
      const combined = `${prefixRef.current}${finalRef.current}${interim}`.trim();
      if (combined) onText(combined);
    };

    recognition.onerror = (ev) => {
      if (ev.error === 'aborted' || ev.error === 'no-speech') return;
      if (ev.error === 'not-allowed') {
        setError('Microphone permission denied. Allow mic access in browser settings.');
      } else {
        setError('Voice input failed. Please try again or type your message.');
      }
      setListening(false);
      recognitionRef.current = null;
    };

    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
      const full = `${prefixRef.current}${finalRef.current}`.trim();
      if (full) onText(full);
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
      setListening(true);
    } catch {
      setError('Could not start microphone. Check permissions and try again.');
      setListening(false);
    }
  }, [getBaseText, language, onText]);

  const toggle = useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  return { listening, supported, error, setError, start, stop, toggle };
}
