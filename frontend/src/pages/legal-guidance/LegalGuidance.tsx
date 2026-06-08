import { useCallback, useEffect, useState } from 'react';
import { publicApi } from '../../services/api';
import { useToast } from '../../components/ui/Toast';
import { MAX_KYC_FILE_BYTES, MAX_KYC_FILE_LABEL } from '../../constants/uploadLimits';
import { useAuth } from '../../context/AuthContext';
import { LEGAL_GUIDANCE_DRAFT_KEY } from '../../components/chat/AIChatbotWidget';
import {
  LegalGuidanceShell,
  WELCOME_TURN,
  type GuidanceChatTurn,
  type GuidanceSessionMeta,
} from '../../components/legal-guidance/LegalGuidanceShell';
import { normalizeLegalChatPayload } from '../../components/legal-guidance/formatLegalResponse';
import { useGuidanceLocation } from '../../hooks/useGuidanceLocation';
import { mapLegalGuidanceError, type SuggestedPromptCard } from './legalGuidanceShared';

const SESSION_STORAGE_KEY = 'lk-ai-guidance-v2';

type StoredSession = {
  id: string;
  title: string;
  updatedAt: number;
  turns: GuidanceChatTurn[];
  language: Language;
};

type SessionStore = {
  sessions: StoredSession[];
  activeId: string | null;
};

function loadSessionStore(): SessionStore {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return { sessions: [], activeId: null };
    const parsed = JSON.parse(raw) as SessionStore;
    if (!parsed || !Array.isArray(parsed.sessions)) return { sessions: [], activeId: null };
    return parsed;
  } catch {
    return { sessions: [], activeId: null };
  }
}

function saveSessionStore(store: SessionStore) {
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* storage full or private mode */
  }
}

function newSessionId() {
  return `s-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export type Language = 'english' | 'urdu' | 'roman_urdu';

const languageOptions: Array<{ value: Language; label: string }> = [
  { value: 'english', label: 'English' },
  { value: 'urdu', label: 'Urdu' },
  { value: 'roman_urdu', label: 'Roman Urdu' },
];

export interface LegalGuidanceProps {
  variant?: 'public' | 'dashboard';
}

export default function LegalGuidance({ variant = 'public' }: LegalGuidanceProps) {
  const toast = useToast();
  const { user } = useAuth();
  const isDashboard = variant === 'dashboard';

  const [language, setLanguage] = useState<Language>('english');
  const [message, setMessage] = useState('');
  const profileCity = user?.citizenProfile?.city || user?.lawyerProfile?.city || '';
  const {
    city: location,
    setCity: setLocation,
    coords,
    detecting: locationDetecting,
    locationError,
    detectLocation,
    setLocationError,
  } = useGuidanceLocation(profileCity);
  const [preferredPracticeArea, setPreferredPracticeArea] = useState('');
  const [maxBudget, setMaxBudget] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessionMetas, setSessionMetas] = useState<GuidanceSessionMeta[]>([]);
  const [chatTurns, setChatTurns] = useState<GuidanceChatTurn[]>([WELCOME_TURN]);

  useEffect(() => {
    const store = loadSessionStore();
    const metas: GuidanceSessionMeta[] = store.sessions
      .map((s) => ({ id: s.id, title: s.title, updatedAt: s.updatedAt }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
    setSessionMetas(metas);

    const active = store.activeId && store.sessions.find((s) => s.id === store.activeId);
    if (active) {
      setActiveSessionId(active.id);
      setChatTurns(active.turns.length ? active.turns : [WELCOME_TURN]);
      setLanguage(active.language || 'english');
    } else if (metas.length > 0) {
      const first = store.sessions.find((s) => s.id === metas[0].id)!;
      setActiveSessionId(first.id);
      setChatTurns(first.turns.length ? first.turns : [WELCOME_TURN]);
      setLanguage(first.language || 'english');
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setHistory([]);
      setHistoryLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res: any = await publicApi.getLegalChatHistory();
        if (!cancelled) {
          const rows = Array.isArray(res?.data) ? res.data : [];
          setHistory(rows);
        }
      } catch {
        if (!cancelled) setHistory([]);
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!isDashboard) return;
    const draft = sessionStorage.getItem(LEGAL_GUIDANCE_DRAFT_KEY);
    if (!draft?.trim()) return;
    sessionStorage.removeItem(LEGAL_GUIDANCE_DRAFT_KEY);
    setMessage(draft.trim());
  }, [isDashboard]);

  const persistActiveSession = useCallback(
    (turns: GuidanceChatTurn[], lang: Language, sessionId: string | null) => {
      if (!sessionId) return;
      const store = loadSessionStore();
      const userTurn = turns.find((t) => t.role === 'user');
      const title = userTurn?.text?.slice(0, 48) || 'New chat';
      const updatedAt = Date.now();
      const existing = store.sessions.find((s) => s.id === sessionId);
      const nextSession: StoredSession = {
        id: sessionId,
        title: existing?.title && existing.title !== 'New chat' && !userTurn ? existing.title : title,
        updatedAt,
        turns,
        language: lang,
      };
      const others = store.sessions.filter((s) => s.id !== sessionId);
      const sessions = [nextSession, ...others];
      saveSessionStore({ sessions, activeId: sessionId });
      setSessionMetas(
        sessions.map((s) => ({ id: s.id, title: s.title, updatedAt: s.updatedAt })).sort((a, b) => b.updatedAt - a.updatedAt),
      );
    },
    [],
  );

  useEffect(() => {
    if (!activeSessionId) return;
    persistActiveSession(chatTurns, language, activeSessionId);
  }, [chatTurns, language, activeSessionId, persistActiveSession]);

  const ensureActiveSession = useCallback(() => {
    if (activeSessionId) return activeSessionId;
    const id = newSessionId();
    setActiveSessionId(id);
    const store = loadSessionStore();
    const session: StoredSession = {
      id,
      title: 'New chat',
      updatedAt: Date.now(),
      turns: [WELCOME_TURN],
      language,
    };
    saveSessionStore({ sessions: [session, ...store.sessions], activeId: id });
    setSessionMetas((prev) => [{ id, title: 'New chat', updatedAt: session.updatedAt }, ...prev]);
    return id;
  }, [activeSessionId, language]);

  const handleNewChat = useCallback(() => {
    const id = newSessionId();
    setActiveSessionId(id);
    setChatTurns([WELCOME_TURN]);
    setMessage('');
    setSelectedFile(null);
    const store = loadSessionStore();
    const session: StoredSession = {
      id,
      title: 'New chat',
      updatedAt: Date.now(),
      turns: [WELCOME_TURN],
      language,
    };
    saveSessionStore({ sessions: [session, ...store.sessions], activeId: id });
    setSessionMetas((prev) => [{ id, title: 'New chat', updatedAt: session.updatedAt }, ...prev]);
  }, [language]);

  const handleSelectSession = useCallback((id: string) => {
    const store = loadSessionStore();
    const session = store.sessions.find((s) => s.id === id);
    if (!session) return;
    setActiveSessionId(id);
    setChatTurns(session.turns.length ? session.turns : [WELCOME_TURN]);
    setLanguage(session.language || 'english');
    setMessage('');
    setSelectedFile(null);
    saveSessionStore({ ...store, activeId: id });
  }, []);

  const handleDeleteSession = useCallback(
    (id: string) => {
      const store = loadSessionStore();
      const remaining = store.sessions.filter((s) => s.id !== id);
      const nextActive = store.activeId === id ? remaining[0]?.id ?? null : store.activeId;
      saveSessionStore({ sessions: remaining, activeId: nextActive });
      setSessionMetas(remaining.map((s) => ({ id: s.id, title: s.title, updatedAt: s.updatedAt })).sort((a, b) => b.updatedAt - a.updatedAt));
      if (store.activeId === id) {
        if (remaining[0]) {
          setActiveSessionId(remaining[0].id);
          setChatTurns(remaining[0].turns.length ? remaining[0].turns : [WELCOME_TURN]);
          setLanguage(remaining[0].language || 'english');
        } else {
          setActiveSessionId(null);
          setChatTurns([WELCOME_TURN]);
        }
      }
      toast.success('Chat deleted');
    },
    [toast],
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    const f = files[0];
    if (f.size > MAX_KYC_FILE_BYTES) {
      toast.error(`"${f.name}" exceeds ${MAX_KYC_FILE_LABEL}.`);
      e.target.value = '';
      return;
    }
    if (/\.(png|jpg|jpeg|gif|webp)$/i.test(f.name)) {
      toast.error('Image OCR is not enabled yet. Please upload text PDF/DOC/TXT or type your question.');
      e.target.value = '';
      return;
    }
    if (!/\.(txt|pdf|docx|doc)$/i.test(f.name)) {
      toast.error('Unsupported file type. Use TXT, PDF, DOC, or DOCX.');
      e.target.value = '';
      return;
    }
    setSelectedFile(f);
    e.target.value = '';
  };

  const applySuggestedPrompt = (card: SuggestedPromptCard) => {
    setMessage(card.prompt);
    if (card.language) setLanguage(card.language);
    if (card.preferredPracticeArea) setPreferredPracticeArea(card.preferredPracticeArea);
  };

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!message.trim() && !selectedFile) {
      toast.error('Please type your legal question or upload a document.');
      return;
    }
    const userText =
      message.trim() ||
      (selectedFile ? 'Please review my uploaded document and explain my situation under Pakistani law.' : '');
    const fileForTurn = selectedFile?.name;
    const payloadMessage = message.trim();
    const fileToSend = selectedFile;

    ensureActiveSession();
    setMessage('');
    setSelectedFile(null);
    setLoading(true);
    setChatTurns((prev) => {
      const withoutWelcome = prev.filter((t) => t.id !== 'welcome');
      return [
        ...withoutWelcome,
        { id: `u-${Date.now()}`, role: 'user', text: userText, fileName: fileForTurn },
      ];
    });
    try {
      const parsedBudget = maxBudget.trim() ? Number.parseInt(maxBudget.replace(/,/g, ''), 10) : undefined;
      const payload = {
        message: payloadMessage,
        language,
        location: location.trim() || undefined,
        latitude: coords?.latitude,
        longitude: coords?.longitude,
        maxBudget: parsedBudget != null && !Number.isNaN(parsedBudget) && parsedBudget > 0 ? parsedBudget : undefined,
        preferredPracticeArea: preferredPracticeArea.trim() || undefined,
      };
      const res: unknown = await publicApi.legalChat(payload, fileToSend || undefined);
      const normalized = normalizeLegalChatPayload(res);

      if (!normalized?.answer) {
        const friendly = 'We did not receive a complete response. Please try again.';
        setChatTurns((prev) => [...prev, { id: `e-${Date.now()}`, role: 'assistant', text: friendly, isError: true }]);
        return;
      }

      setChatTurns((prev) => [...prev, { id: `a-${Date.now()}`, role: 'assistant', result: normalized }]);

      if (user) {
        try {
          const hist: any = await publicApi.getLegalChatHistory();
          setHistory(Array.isArray(hist?.data) ? hist.data : []);
        } catch {
          /* keep prior history */
        }
      }
    } catch (err: unknown) {
      const friendly = mapLegalGuidanceError(err);
      setChatTurns((prev) => [...prev, { id: `e-${Date.now()}`, role: 'assistant', text: friendly, isError: true }]);
      toast.error(friendly);
    } finally {
      setLoading(false);
    }
  };

  return (
    <LegalGuidanceShell
      variant={isDashboard ? 'dashboard' : 'public'}
      chatTurns={chatTurns}
      loading={loading}
      message={message}
      setMessage={setMessage}
      selectedFile={selectedFile}
      setSelectedFile={setSelectedFile}
      language={language}
      setLanguage={setLanguage}
      languageOptions={languageOptions}
      onSubmit={onSubmit}
      onFileChange={handleFileChange}
      applySuggestedPrompt={applySuggestedPrompt}
      sessions={sessionMetas}
      activeSessionId={activeSessionId}
      onNewChat={handleNewChat}
      onSelectSession={handleSelectSession}
      onDeleteSession={handleDeleteSession}
      serverHistory={history}
      historyLoading={historyLoading}
      userLoggedIn={!!user}
      location={location}
      setLocation={(value) => {
        setLocationError(null);
        setLocation(value);
      }}
      onDetectLocation={detectLocation}
      locationDetecting={locationDetecting}
      locationError={locationError}
      maxBudget={maxBudget}
      setMaxBudget={setMaxBudget}
    />
  );
}
