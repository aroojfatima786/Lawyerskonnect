import { useEffect, useState, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { FiSend, FiPaperclip, FiSearch, FiMoreVertical, FiMessageCircle, FiInfo, FiFileText, FiImage, FiX, FiTrash2 } from 'react-icons/fi';
import { MessageReadTicks } from '../../components/chat/MessageReadTicks';
import { MessageContextMenu } from '../../components/chat/MessageContextMenu';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '../../context/AuthContext';
import { chatApi } from '../../services/api';
import { Card, Avatar, Button, Input, Modal, Textarea, ConfirmDialog } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import { authStorage } from '../../utils/authStorage';
import { getApiBaseUrl } from '../../config/apiBase';

const MAX_ATTACH_BYTES = 10 * 1024 * 1024;
const ALLOWED_ATTACH_EXT = /\.(pdf|doc|docx|png|jpe?g)$/i;

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function attachmentIcon(mimeType?: string, name?: string) {
  const mime = String(mimeType || '').toLowerCase();
  const n = String(name || '').toLowerCase();
  if (mime.startsWith('image/') || /\.(png|jpe?g)$/i.test(n)) {
    return <FiImage className="shrink-0 text-lk-accent" aria-hidden />;
  }
  return <FiFileText className="shrink-0 text-lk-accent" aria-hidden />;
}

export default function Messages() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const messagesScrollRef = useRef<HTMLDivElement>(null);

  const [conversations, setConversations] = useState<any[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [openMessageMenuId, setOpenMessageMenuId] = useState<string | null>(null);
  const [dialogLoading, setDialogLoading] = useState(false);
  const [editDraft, setEditDraft] = useState('');
  const [editError, setEditError] = useState('');
  const [pendingDialog, setPendingDialog] = useState<
    | { kind: 'hide-conversation'; conversationId: string }
    | { kind: 'delete-message'; messageId: string }
    | { kind: 'edit-message'; messageId: string; content: string }
    | null
  >(null);
  const [attachOversize, setAttachOversize] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const shownGateToastRef = useRef<Set<string>>(new Set());
  const socketRef = useRef<Socket | null>(null);
  const selectedConversationRef = useRef<any>(null);

  useEffect(() => {
    loadConversations();
  }, []);

  useEffect(() => {
    selectedConversationRef.current = selectedConversation;
  }, [selectedConversation]);

  useEffect(() => {
    setHeaderMenuOpen(false);
    setOpenMessageMenuId(null);
    setAttachOversize(false);
    setPendingFile(null);
  }, [selectedConversation?.conversationId]);

  useEffect(() => {
    const handleNotificationEvent = (event: Event) => {
      const custom = event as CustomEvent<any>;
      const notification = custom?.detail;
      const type = String(notification?.type || '').toLowerCase();
      if (type !== 'new_message') return;

      const conversationId =
        notification?.data?.conversationId ||
        notification?.conversationId ||
        '';

      // Always refresh left conversation list (latest message + unread counter)
      void loadConversations();

      // If this conversation is currently open, refresh messages instantly
      const active = selectedConversationRef.current;
      const activeConversationId = active?.conversationId;
      if (activeConversationId && (!conversationId || activeConversationId === conversationId)) {
        void loadMessages(activeConversationId);
      }
    };

    window.addEventListener('lk:new-notification', handleNotificationEvent as EventListener);
    return () => {
      window.removeEventListener('lk:new-notification', handleNotificationEvent as EventListener);
    };
  }, []);

  useEffect(() => {
    const token = authStorage.getToken();
    if (!token) return;

    const socket = io(`${getApiBaseUrl()}/chat`, {
      auth: { token },
    });
    socketRef.current = socket;

    socket.on('newMessage', (incoming: any) => {
      if (!incoming?.conversationId) return;
      const currentSelected = selectedConversationRef.current;

      // Live update current open thread without manual refresh
      if (currentSelected?.conversationId === incoming.conversationId) {
        setMessages((prev) => {
          if (prev.some((m) => m._id === incoming._id)) return prev;
          return [...prev, incoming];
        });
        // Mark immediately as read in active chat
        void chatApi.markAsRead(incoming.conversationId).catch(() => {});
      }

      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.conversationId === incoming.conversationId);
        if (idx === -1) {
          // If not in list yet (rare), reload conversations
          void loadConversations();
          return prev;
        }
        const copy = [...prev];
        const current = copy[idx];
        const isOpen = currentSelected?.conversationId === incoming.conversationId;
        copy[idx] = {
          ...current,
          lastMessage: incoming.content || '[Attachment]',
          lastMessageAt: incoming.createdAt || new Date().toISOString(),
          unreadCount: isOpen ? 0 : (current.unreadCount || 0) + 1,
        };
        // move updated conversation to top
        const [updated] = copy.splice(idx, 1);
        return [updated, ...copy];
      });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  useEffect(() => {
    // Auto-select conversation if userId is in URL
    void ensureConversationFromQuery();
  }, [searchParams, conversations, user?._id]);

  const ensureConversationFromQuery = async () => {
    const userId = searchParams.get('userId');
    const conversationId = searchParams.get('conversationId');
    const appointmentId = searchParams.get('appointmentId');
    if (conversationId && conversations.length > 0) {
      const convById = conversations.find((c) => c.conversationId === conversationId);
      if (convById) {
        setSelectedConversation(convById);
        return;
      }
    }
    if (appointmentId && conversations.length > 0) {
      const convByAppointment = conversations.find((c) => c.appointmentId === appointmentId);
      if (convByAppointment) {
        setSelectedConversation(convByAppointment);
        return;
      }
    }
    if (userId && conversations.length > 0) {
      const conv = conversations.find(
        (c) => c.otherParticipant?._id === userId
      );
      if (conv) {
        setSelectedConversation(conv);
        return;
      }
    }

    // If user opened /messages?userId=... and no conversation exists yet, create/fetch it.
    if (!userId) return;
    try {
      const response: any = await chatApi.getConversationWithUser(userId);
      const conversation = response?.data;
      if (!conversation) return;
      const participants = Array.isArray(conversation.participants) ? conversation.participants : [];
      const otherParticipant = participants.find((p: any) => String(p?._id) !== String(user?._id));
      const hydrated = {
        conversationId: conversation.conversationId,
        otherParticipant,
        unreadCount: 0,
        lastMessage: conversation.lastMessageContent,
        lastMessageAt: conversation.lastMessageAt,
        ...(response?.availability || {}),
      };
      setConversations((prev) => {
        if (prev.some((c) => c.conversationId === hydrated.conversationId)) return prev;
        return [hydrated, ...prev];
      });
      setSelectedConversation(hydrated);
    } catch (error: any) {
      const code = error?.code;
      const msg = error?.message || '';
      if (
        code === 'PAYMENT_REQUIRED' ||
        msg.includes('Payment required before consultation chat can start.')
      ) {
        toast.error('Payment required before consultation chat can start.');
      } else if (code === 'CONSULTATION_NOT_STARTED') {
        toast.error('Consultation chat will be available at the scheduled appointment time.');
      } else {
        console.error('Failed to open conversation:', error);
      }
    }
  };

  useEffect(() => {
    if (selectedConversation) {
      loadMessages(selectedConversation.conversationId);
    }
  }, [selectedConversation]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, selectedConversation?.conversationId]);

  const loadConversations = async () => {
    try {
      const response: any = await chatApi.getConversations();
      setConversations(response.data || []);
    } catch (error: any) {
      if (error?.code === 'PAYMENT_REQUIRED') {
        toast.error('Payment required before consultation chat can start.');
      } else if (error?.code === 'CONSULTATION_NOT_STARTED') {
        toast.error('Consultation chat will be available at the scheduled appointment time.');
      } else {
        console.error('Failed to load conversations:', error);
      }
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (conversationId: string) => {
    try {
      const response: any = await chatApi.getMessages(conversationId);
      setMessages(response.data || []);
      
      // Mark as read
      await chatApi.markAsRead(conversationId);
      setConversations((prev) =>
        prev.map((c) => (c.conversationId === conversationId ? { ...c, unreadCount: 0 } : c)),
      );
      window.dispatchEvent(new CustomEvent('lk:chat-unread-updated'));
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  };

  const handleCopyMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    try {
      await navigator.clipboard.writeText(trimmed);
      toast.success('Copied to clipboard');
    } catch {
      toast.error('Could not copy text');
    }
  };

  const requestDeleteMessage = (messageId: string) => {
    setOpenMessageMenuId(null);
    setPendingDialog({ kind: 'delete-message', messageId });
  };

  const requestEditMessage = (messageId: string, currentContent: string) => {
    setOpenMessageMenuId(null);
    setEditDraft(currentContent || '');
    setEditError('');
    setPendingDialog({ kind: 'edit-message', messageId, content: currentContent || '' });
  };

  const confirmDeleteMessage = async () => {
    if (pendingDialog?.kind !== 'delete-message') return;
    const { messageId } = pendingDialog;
    setDialogLoading(true);
    try {
      await chatApi.deleteMessage(messageId);
      setMessages((prev) => prev.filter((m) => m._id !== messageId));
      setPendingDialog(null);
      toast.success('Message deleted');
    } catch (error: any) {
      toast.error(error?.message || 'Could not delete message');
    } finally {
      setDialogLoading(false);
    }
  };

  const confirmEditMessage = async () => {
    if (pendingDialog?.kind !== 'edit-message') return;
    const { messageId, content: previous } = pendingDialog;
    const trimmed = editDraft.trim();
    if (!trimmed) {
      setEditError('Message cannot be empty');
      return;
    }
    if (trimmed === previous.trim()) {
      setPendingDialog(null);
      return;
    }
    setDialogLoading(true);
    setEditError('');
    try {
      const res: any = await chatApi.editMessage(messageId, trimmed);
      const updated = res?.data ?? { _id: messageId, content: trimmed };
      setMessages((prev) =>
        prev.map((m) => (m._id === messageId ? { ...m, ...updated, content: trimmed } : m)),
      );
      setPendingDialog(null);
      toast.success('Message updated');
    } catch (error: any) {
      toast.error(error?.response?.data?.message || error?.message || 'Could not edit message');
    } finally {
      setDialogLoading(false);
    }
  };

  const scrollToBottom = () => {
    const el = messagesScrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  };

  const requestHideConversation = (conversationId: string) => {
    setHeaderMenuOpen(false);
    setPendingDialog({ kind: 'hide-conversation', conversationId });
  };

  const confirmHideConversation = async () => {
    if (pendingDialog?.kind !== 'hide-conversation') return;
    const { conversationId } = pendingDialog;
    setDialogLoading(true);
    try {
      await chatApi.hideConversation(conversationId);
      setConversations((prev) => prev.filter((c) => c.conversationId !== conversationId));
      if (selectedConversation?.conversationId === conversationId) {
        setSelectedConversation(null);
        setMessages([]);
      }
      setPendingDialog(null);
      toast.success('Conversation removed from your list');
    } catch (error: any) {
      toast.error(error?.message || 'Could not remove conversation');
    } finally {
      setDialogLoading(false);
    }
  };

  const onAttachmentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > MAX_ATTACH_BYTES) {
      setAttachOversize(true);
      setPendingFile(null);
      toast.error('File size exceeds 10MB. Please attach a smaller file.');
      return;
    }
    if (!ALLOWED_ATTACH_EXT.test(f.name)) {
      setAttachOversize(false);
      setPendingFile(null);
      toast.error('Unsupported file type. Use PDF, DOC, DOCX, PNG, JPG, or JPEG.');
      return;
    }
    setAttachOversize(false);
    setPendingFile(f);
  };

  const handleChatError = (error: any, fallback: string) => {
    const msg = error?.message || fallback;
    const code = error?.code;
    if (code === 'PAYMENT_REQUIRED' || msg.includes('Payment required before consultation chat can start.')) {
      toast.error('Payment required before consultation chat can start.');
    } else if (code === 'CONSULTATION_NOT_STARTED') {
      toast.error('Consultation chat will be available at the scheduled appointment time.');
    } else if (code === 'CONTACT_SHARING_NOT_ALLOWED') {
      toast.warning(
        'Sharing personal contact information is not allowed. Please continue communication inside LawyersKonnect.',
      );
    } else if (msg.includes('File size exceeds 10MB') || msg.includes('Unsupported file type')) {
      toast.error(msg);
    } else {
      toast.error(msg);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedConversation) return;
    const text = newMessage.trim();
    if (!text && !pendingFile) return;

    const receiverId = selectedConversation.otherParticipant._id;
    setSendingMessage(true);
    try {
      let attachments: any[] | undefined;
      if (pendingFile) {
        setUploadingAttachment(true);
        const uploadRes: any = await chatApi.uploadAttachment(receiverId, pendingFile);
        attachments = uploadRes?.data ? [uploadRes.data] : undefined;
        if (!attachments?.length) {
          throw { message: 'Upload failed. Please try again.' };
        }
      }

      const response: any = await chatApi.sendMessage(receiverId, text || undefined, attachments);

      setMessages([...messages, response.data]);
      setNewMessage('');
      setPendingFile(null);
      loadConversations();
    } catch (error: any) {
      handleChatError(error, 'Failed to send message');
    } finally {
      setSendingMessage(false);
      setUploadingAttachment(false);
    }
  };

  const filteredConversations = conversations.filter((conv) => {
    const name = conv.otherParticipant?.citizenProfile?.fullName ||
      conv.otherParticipant?.lawyerProfile?.fullName || '';
    return name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const getParticipantName = (participant: any) => {
    return participant?.citizenProfile?.fullName ||
      participant?.lawyerProfile?.fullName ||
      participant?.email?.split('@')[0] ||
      'User';
  };

  const formatGateReason = (conv: any) => {
    if (!conv?.blockedReason) return '';
    if (conv.blockedReason === 'PAYMENT_REQUIRED') {
      return 'Payment required before consultation chat can start.';
    }
    if (conv.blockedReason === 'CONSULTATION_NOT_STARTED') {
      const formatSlotTime12Hour = (rawTime: string) => {
        const raw = String(rawTime || '').trim();
        if (!raw) return 'scheduled time';
        if (raw.includes('T')) {
          const dt = new Date(raw);
          if (!Number.isNaN(dt.getTime())) {
            return dt.toLocaleTimeString('en-PK', {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
              timeZone: 'Asia/Karachi',
            });
          }
        }
        const normalized = raw.replace('.', ':');
        const [hhRaw, mmRaw] = normalized.split(':');
        const hh = parseInt(hhRaw || '0', 10);
        const mm = parseInt(mmRaw || '0', 10);
        if (!Number.isFinite(hh) || !Number.isFinite(mm)) return raw;
        const period = hh >= 12 ? 'PM' : 'AM';
        const h12 = hh % 12 || 12;
        return `${h12}:${String(mm).padStart(2, '0')} ${period}`;
      };

      let timeStr = 'scheduled time';
      if (conv.appointmentDate && conv.appointmentStartTime) {
        const time12 = formatSlotTime12Hour(String(conv.appointmentStartTime));
        const dateObj = new Date(`${conv.appointmentDate}T00:00:00`);
        const dateLabel = Number.isNaN(dateObj.getTime())
          ? conv.appointmentDate
          : dateObj.toLocaleDateString('en-PK');
        timeStr = `${dateLabel}, ${time12}`;
      } else if (conv.appointmentStartTime) {
        timeStr = formatSlotTime12Hour(String(conv.appointmentStartTime));
      }
      return `Consultation chat will be available at scheduled time. Chat opens at ${timeStr}.`;
    }
    if (conv.blockedReason === 'APPOINTMENT_NOT_CONFIRMED') {
      return 'Chat becomes available after appointment confirmation.';
    }
    if (conv.blockedReason === 'APPOINTMENT_ENDED_OR_CANCELLED') {
      return 'Chat is unavailable because this appointment ended or was cancelled.';
    }
    return '';
  };

  useEffect(() => {
    const conv = selectedConversation;
    if (!conv || conv.canSendMessage !== false || !conv.blockedReason) return;
    const key = `${conv.conversationId}:${conv.blockedReason}`;
    if (shownGateToastRef.current.has(key)) return;
    shownGateToastRef.current.add(key);
    if (conv.blockedReason === 'PAYMENT_REQUIRED') {
      toast.error('Payment required before consultation chat can start.');
    } else if (conv.blockedReason === 'CONSULTATION_NOT_STARTED') {
      toast.info('Consultation chat will be available at the scheduled appointment time.');
    }
  }, [selectedConversation, toast]);

  return (
    <div className="flex h-[min(720px,calc(100dvh-11.5rem))] min-h-[480px] flex-col gap-4 overflow-hidden lg:flex-row lg:gap-4">
      <Card
        className="lk-portal-card flex h-[38%] min-h-[220px] w-full flex-shrink-0 flex-col overflow-hidden rounded-2xl border-slate-200/90 shadow-lk-card-lg ring-1 ring-slate-100/80 lg:h-full lg:min-h-0 lg:w-[min(100%,360px)]"
        padding="none"
      >
        <div className="border-b border-slate-200/90 bg-gradient-to-r from-slate-50 to-blue-50/40 px-4 py-3.5">
          <h2 className="mb-2 text-base font-bold text-lk-navy">Conversations</h2>
          <div className="relative">
            <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lk-muted" />
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by lawyer name…"
              className="min-h-[44px] rounded-xl border-slate-200/90 bg-white py-2.5 pl-10 shadow-sm"
            />
          </div>
        </div>

        <div className="lk-scroll-elegant min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {loading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex gap-3 animate-pulse">
                  <div className="h-12 w-12 rounded-full bg-slate-200" />
                  <div className="flex-1">
                    <div className="h-4 bg-slate-200 rounded w-3/4 mb-2" />
                    <div className="h-3 bg-slate-200 rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="p-6 text-center text-sm text-lk-muted">No conversations yet.</div>
          ) : (
            filteredConversations.map((conv) => (
              <div
                key={conv.conversationId}
                className={`flex w-full items-stretch border-b border-slate-100/90 transition-colors hover:bg-blue-50/40 ${
                  selectedConversation?.conversationId === conv.conversationId
                    ? 'border-l-[3px] border-l-lk-accent bg-gradient-to-r from-blue-50/90 to-white'
                    : ''
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setSelectedConversation(conv);
                    if (conv.unreadCount > 0) {
                      setConversations((prev) =>
                        prev.map((c) =>
                          c.conversationId === conv.conversationId ? { ...c, unreadCount: 0 } : c,
                        ),
                      );
                    }
                  }}
                  className="flex min-w-0 flex-1 gap-3 p-4 pr-2 text-left"
                >
                  <Avatar
                    src={conv.otherParticipant?.lawyerProfile?.profilePictureUrl}
                    name={getParticipantName(conv.otherParticipant)}
                    size="md"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-semibold text-lk-navy">{getParticipantName(conv.otherParticipant)}</span>
                      <span className="flex shrink-0 items-center gap-2">
                        {conv.lastMessageAt ? (
                          <span className="text-[10px] font-medium tabular-nums text-lk-muted">
                            {new Date(conv.lastMessageAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                          </span>
                        ) : null}
                        {conv.unreadCount > 0 && (
                          <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-lk-accent px-1.5 text-xs font-semibold text-white">
                            {conv.unreadCount}
                          </span>
                        )}
                      </span>
                    </div>
                    <p className="truncate text-sm text-lk-muted">{conv.lastMessage || 'No messages yet'}</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => requestHideConversation(conv.conversationId)}
                  className="flex shrink-0 items-center justify-center px-3 text-lk-muted transition hover:bg-red-50 hover:text-red-600"
                  aria-label="Remove conversation from list"
                  title="Remove from list"
                >
                  <FiTrash2 className="h-4 w-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* Chat Area */}
      <Card
        className="lk-portal-card flex min-h-[280px] min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border-slate-200/90 shadow-lk-card-lg ring-1 ring-slate-100/80 lg:h-full lg:min-h-0"
        padding="none"
      >
        {selectedConversation ? (
          <>
            <div className="relative flex flex-wrap items-start justify-between gap-3 border-b border-slate-200/90 bg-white px-4 py-3.5 sm:items-center sm:px-5">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar
                  src={selectedConversation.otherParticipant?.lawyerProfile?.profilePictureUrl}
                  name={getParticipantName(selectedConversation.otherParticipant)}
                  size="md"
                />
                <div className="min-w-0">
                  <h3 className="truncate font-bold text-lk-navy">{getParticipantName(selectedConversation.otherParticipant)}</h3>
                  <p className="mt-0.5 text-xs text-lk-muted capitalize">{selectedConversation.otherParticipant?.role}</p>
                </div>
              </div>
              <div className="relative flex shrink-0 items-center gap-2">
                <span className="hidden items-center gap-1 rounded-full border border-slate-200/90 bg-slate-50 px-2.5 py-1 text-[10px] font-medium text-lk-muted sm:inline-flex">
                  <FiInfo className="text-lk-accent" aria-hidden />
                  Secure consultation chat
                </span>
                <button
                  type="button"
                  className="rounded-full p-2 text-lk-muted transition hover:bg-slate-100 hover:text-lk-navy"
                  aria-label="Chat menu"
                  aria-expanded={headerMenuOpen}
                  onClick={() => setHeaderMenuOpen((o) => !o)}
                >
                  <FiMoreVertical className="text-lg" />
                </button>
                {headerMenuOpen && (
                  <>
                    <button
                      type="button"
                      className="fixed inset-0 z-[45] cursor-default bg-transparent"
                      aria-label="Close menu"
                      onClick={() => setHeaderMenuOpen(false)}
                    />
                    <div className="absolute right-0 top-full z-50 mt-1 w-52 overflow-hidden rounded-xl border border-slate-200/90 bg-white py-1 shadow-xl shadow-slate-900/15 ring-1 ring-slate-100">
                      <button
                        type="button"
                        className="flex w-full px-4 py-2.5 text-left text-sm text-lk-muted hover:bg-slate-50"
                        onClick={() => setHeaderMenuOpen(false)}
                      >
                        Conversation details
                      </button>
                      <button
                        type="button"
                        className="flex w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50"
                        onClick={() => {
                          setHeaderMenuOpen(false);
                          if (selectedConversation?.conversationId) {
                            requestHideConversation(selectedConversation.conversationId);
                          }
                        }}
                      >
                        Remove from list
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div
              ref={messagesScrollRef}
              className="lk-scroll-elegant min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain bg-gradient-to-b from-[#e8eef8] via-[#eef2fb] to-[#e4eaf6] p-4 sm:p-5"
            >
              {messages.map((message) => {
                const isMe =
                  (typeof message.senderId === 'string' ? message.senderId : message.senderId?._id) === user?._id;
                const read = Boolean(message.isRead);
                const time = new Date(message.createdAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                });

                const hasText = Boolean(message.content?.trim());
                const hasAttachments = Array.isArray(message.attachments) && message.attachments.length > 0;
                const canEditMessage = isMe && hasText && !hasAttachments;

                return (
                  <div key={message._id} className={`group flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[88%] sm:max-w-[72%] ${isMe ? 'pr-1' : ''}`}>
                      <MessageContextMenu
                        messageId={message._id}
                        isOwn={isMe}
                        canEdit={canEditMessage}
                        canCopy={hasText}
                        align={isMe ? 'right' : 'left'}
                        openMessageId={openMessageMenuId}
                        onOpenChange={setOpenMessageMenuId}
                        onEdit={
                          canEditMessage
                            ? () => requestEditMessage(message._id, message.content || '')
                            : undefined
                        }
                        onDelete={isMe ? () => requestDeleteMessage(message._id) : undefined}
                        onCopy={hasText ? () => handleCopyMessage(message.content || '') : undefined}
                      >
                      <div
                        className={`rounded-2xl border px-4 py-3 shadow-sm ${
                          isMe
                            ? 'rounded-br-md border-blue-300/80 bg-gradient-to-br from-lk-navy to-[#1e3a8f] text-white'
                            : 'rounded-bl-md border-slate-200/90 bg-white text-lk-navy'
                        }`}
                      >
                      {hasAttachments && (
                        <div className="mb-2 space-y-1.5">
                          {message.attachments.map((att: any, idx: number) => (
                            <a
                              key={idx}
                              href={att.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              download={att.originalName || att.filename}
                              className="flex items-center gap-2 rounded-lg border border-slate-200/90 bg-slate-50/90 px-2.5 py-2 text-xs font-medium text-lk-navy transition hover:border-lk-accent/30 hover:bg-blue-50/50"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {attachmentIcon(att.mimeType, att.originalName || att.filename)}
                              <span className="min-w-0 flex-1 truncate">{att.originalName || att.filename || 'Attachment'}</span>
                              <span className="shrink-0 text-[10px] text-lk-muted">
                                {att.size ? formatFileSize(Number(att.size)) : 'Open'}
                              </span>
                            </a>
                          ))}
                        </div>
                      )}
                      {hasText ? (
                        <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
                      ) : null}
                      <div className={`mt-1 flex items-center justify-end gap-2 text-[11px] ${isMe ? 'text-white/75' : 'text-lk-muted'}`}>
                        <span>{time}</span>
                        {isMe ? <MessageReadTicks read={read} onDark /> : null}
                      </div>
                        </div>
                      </MessageContextMenu>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Message Input - UC-05: attachments max 10MB per file */}
            <form onSubmit={handleSendMessage} className="border-t border-slate-200/90 bg-white/95 px-4 py-3 backdrop-blur-sm sm:px-5 sm:py-4">
              {attachOversize && (
                <p className="mb-2 rounded-lg border border-amber-200/90 bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-950">
                  Selected file exceeds 10MB. Choose a smaller attachment.
                </p>
              )}
              {selectedConversation?.canSendMessage === false && (
                <div className="mb-3 rounded-xl border border-amber-200/90 bg-amber-50/95 px-3 py-2.5 text-sm text-amber-950 shadow-sm">
                  {formatGateReason(selectedConversation)}
                  {selectedConversation?.blockedReason === 'PAYMENT_REQUIRED' && selectedConversation?.appointmentId && (
                    <div className="mt-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          navigate(`/client/payments/checkout/${selectedConversation.appointmentId}`);
                        }}
                      >
                        Pay consultation fee
                      </Button>
                    </div>
                  )}
                </div>
              )}
              {pendingFile ? (
                <div className="mb-2 flex items-center gap-2 rounded-xl border border-slate-200/90 bg-slate-50 px-3 py-2 text-xs">
                  {attachmentIcon(pendingFile.type, pendingFile.name)}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-lk-navy">{pendingFile.name}</p>
                    <p className="text-[10px] text-lk-muted">{formatFileSize(pendingFile.size)} · PDF, DOC, DOCX, PNG, JPG</p>
                  </div>
                  <button
                    type="button"
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-lk-muted hover:bg-white hover:text-lk-navy"
                    onClick={() => setPendingFile(null)}
                    aria-label="Remove attachment"
                    disabled={sendingMessage}
                  >
                    <FiX />
                  </button>
                </div>
              ) : null}
              {uploadingAttachment ? (
                <p className="mb-2 text-center text-[11px] font-medium text-lk-muted">Uploading attachment…</p>
              ) : null}
              <div className="flex items-end gap-2 rounded-2xl border border-slate-200/90 bg-slate-50/90 p-2 shadow-inner ring-1 ring-slate-100/80">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                  onChange={onAttachmentChange}
                />
                <button
                  type="button"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-transparent text-lk-muted transition hover:border-slate-200 hover:bg-white hover:text-lk-navy disabled:opacity-40"
                  title="Attach file"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={selectedConversation?.canSendMessage === false}
                >
                  <FiPaperclip />
                </button>
                <Input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type a message…"
                  className="min-h-[48px] flex-1 rounded-xl border-slate-200/90 bg-white py-3 shadow-sm disabled:bg-slate-100"
                  disabled={selectedConversation?.canSendMessage === false}
                />
                <Button
                  type="submit"
                  disabled={(!newMessage.trim() && !pendingFile) || sendingMessage || selectedConversation?.canSendMessage === false}
                  isLoading={sendingMessage}
                  className="hidden h-11 shrink-0 px-5 sm:inline-flex"
                >
                  {uploadingAttachment ? 'Uploading…' : 'Send'}
                </Button>
                <Button
                  type="submit"
                  disabled={(!newMessage.trim() && !pendingFile) || sendingMessage || selectedConversation?.canSendMessage === false}
                  isLoading={sendingMessage}
                  className="h-11 w-11 shrink-0 sm:hidden"
                  aria-label="Send"
                >
                  <FiSend />
                </Button>
              </div>
              <p className="mt-2 text-center text-[10px] text-lk-muted sm:text-left">
                Secure consultation chat · Max 10MB per file
              </p>
            </form>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-slate-200/90 bg-slate-50/60 px-6 py-16 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-200/90 bg-white shadow-sm">
              <FiMessageCircle className="text-2xl text-lk-accent" aria-hidden />
            </div>
            <div>
              <p className="text-base font-semibold text-lk-navy">Select a conversation</p>
              <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-lk-muted">Open a thread to view secure consultation messages and attachments.</p>
            </div>
          </div>
        )}
      </Card>

      <ConfirmDialog
        isOpen={pendingDialog?.kind === 'hide-conversation'}
        onClose={() => {
          if (!dialogLoading) setPendingDialog(null);
        }}
        onConfirm={confirmHideConversation}
        title="Remove chat from list?"
        message="This chat will be hidden from your list. You can open it again from Appointments when the consultation is active."
        confirmLabel="Remove"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={dialogLoading}
      />

      <ConfirmDialog
        isOpen={pendingDialog?.kind === 'delete-message'}
        onClose={() => {
          if (!dialogLoading) setPendingDialog(null);
        }}
        onConfirm={confirmDeleteMessage}
        title="Delete message?"
        message="This message will be deleted for everyone in this chat. This cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={dialogLoading}
      />

      <Modal
        isOpen={pendingDialog?.kind === 'edit-message'}
        onClose={() => {
          if (!dialogLoading) setPendingDialog(null);
        }}
        title="Edit message"
        subtitle="Update your message text"
        size="sm"
      >
        <div className="space-y-4 px-6 py-5">
          <Textarea
            label="Message"
            value={editDraft}
            onChange={(e) => {
              setEditDraft(e.target.value);
              if (editError) setEditError('');
            }}
            rows={4}
            autoFocus
            error={editError}
            disabled={dialogLoading}
          />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={dialogLoading}
              onClick={() => setPendingDialog(null)}
            >
              Cancel
            </Button>
            <Button type="button" disabled={dialogLoading} isLoading={dialogLoading} onClick={() => void confirmEditMessage()}>
              Save changes
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
