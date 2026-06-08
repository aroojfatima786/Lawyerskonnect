import { useEffect, useState } from 'react';
import { FiMessageCircle, FiSend, FiClock, FiCheckCircle, FiAlertCircle } from 'react-icons/fi';
import { complaintApi } from '../../services/api';
import { Card, Button, Input, Textarea, Modal } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import { COMPLAINT_MAX_SUBJECT, COMPLAINT_MAX_WORDS, countWords } from '../../utils/wordCount';

const CATEGORIES = [
  { value: 'general', label: 'General' },
  { value: 'payment', label: 'Payment' },
  { value: 'appointment', label: 'Appointment' },
  { value: 'lawyer', label: 'Lawyer / Service' },
  { value: 'technical', label: 'Technical Issue' },
  { value: 'other', label: 'Other' },
];

const STATUS_MAP: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  open: { label: 'Open', className: 'bg-amber-100 text-amber-800', icon: <FiAlertCircle className="inline mr-1" /> },
  in_progress: { label: 'In Progress', className: 'bg-blue-100 text-blue-800', icon: <FiClock className="inline mr-1" /> },
  resolved: { label: 'Resolved', className: 'bg-green-100 text-green-800', icon: <FiCheckCircle className="inline mr-1" /> },
  closed: { label: 'Closed', className: 'bg-slate-100 text-slate-700', icon: <FiCheckCircle className="inline mr-1" /> },
};

export default function HelpSupport() {
  const toast = useToast();
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [form, setForm] = useState({ subject: '', message: '', category: 'general' });
  const [submitting, setSubmitting] = useState(false);

  const messageWords = countWords(form.message);

  const loadList = async () => {
    setLoading(true);
    try {
      const res: any = await complaintApi.getMy();
      setList(res.data || []);
    } catch {
      toast.error('Failed to load complaints');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadList();
  }, []);

  useEffect(() => {
    if (!detailId) {
      setDetail(null);
      return;
    }
    complaintApi
      .getById(detailId)
      .then((res: any) => setDetail(res.data))
      .catch(() => toast.error('Failed to load detail'));
  }, [detailId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.subject.trim() || !form.message.trim()) return;
    if (form.subject.length > COMPLAINT_MAX_SUBJECT) {
      toast.error(`Subject must be ${COMPLAINT_MAX_SUBJECT} characters or less.`);
      return;
    }
    if (messageWords > COMPLAINT_MAX_WORDS) {
      toast.error(`Message must be ${COMPLAINT_MAX_WORDS} words or less.`);
      return;
    }
    setSubmitting(true);
    try {
      await complaintApi.create({
        subject: form.subject.trim(),
        message: form.message.trim(),
        category: form.category,
      });
      toast.success('Complaint submitted. We will get back to you soon.');
      setShowForm(false);
      setForm({ subject: '', message: '', category: 'general' });
      loadList();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  };

  const statusInfo = (status: string) => STATUS_MAP[status] || STATUS_MAP.open;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button leftIcon={<FiSend />} onClick={() => setShowForm(true)}>
          New complaint
        </Button>
      </div>

      {loading ? (
        <Card className="py-12 text-center text-lk-muted">Loading...</Card>
      ) : list.length === 0 ? (
        <Card className="py-12 text-center">
          <FiMessageCircle className="mx-auto mb-3 text-4xl text-slate-300" />
          <p className="text-lk-muted">No complaints yet.</p>
          <Button className="mt-3" variant="outline" onClick={() => setShowForm(true)}>
            Submit a complaint
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {list.map((c) => {
            const st = statusInfo(c.status);
            return (
              <Card
                key={c._id}
                className="cursor-pointer border-slate-200/90 transition hover:border-blue-200/80 hover:shadow-md"
                onClick={() => setDetailId(c._id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-lk-navy">{c.subject}</span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-lk-muted">
                        {c.category}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-lk-muted">{c.message}</p>
                    <p className="mt-2 text-xs text-lk-muted">{new Date(c.createdAt).toLocaleString()}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${st.className}`}>
                    {st.icon}
                    {st.label}
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title="Submit a complaint">
        <form onSubmit={handleSubmit} className="space-y-3 p-5">
          <Input
            label="Subject"
            value={form.subject}
            onChange={(e) => setForm({ ...form, subject: e.target.value.slice(0, COMPLAINT_MAX_SUBJECT) })}
            placeholder="Brief subject"
            helperText={`${form.subject.length}/${COMPLAINT_MAX_SUBJECT} characters`}
            required
          />
          <div>
            <label className="mb-2 block text-sm font-semibold text-lk-navy">Category</label>
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="min-h-[42px] w-full rounded-xl border border-lk-border px-4 py-2.5 text-sm text-lk-navy focus:border-lk-accent focus:outline-none focus:ring-2 focus:ring-lk-accent/25"
            >
              {CATEGORIES.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <Textarea
            label="Message"
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
            placeholder="Describe your issue or complaint..."
            rows={5}
            helperText={`${messageWords}/${COMPLAINT_MAX_WORDS} words`}
            required
          />
          <div className="flex gap-2 pt-2">
            <Button type="submit" isLoading={submitting} disabled={messageWords > COMPLAINT_MAX_WORDS} className="flex-1">
              Submit
            </Button>
            <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!detailId} onClose={() => setDetailId(null)} title="Complaint detail">
        {detail ? (
          <div className="space-y-4 p-5">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-lk-navy">{detail.subject}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusInfo(detail.status).className}`}>
                  {statusInfo(detail.status).label}
                </span>
              </div>
              <p className="mt-1 text-sm capitalize text-lk-muted">
                {detail.category} · {new Date(detail.createdAt).toLocaleString()}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-lk-navy">{detail.message}</p>
            </div>
            {detail.adminReply && (
              <div className="rounded-xl border border-blue-100 bg-blue-50/80 p-4">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-lk-muted">Admin response</p>
                <p className="whitespace-pre-wrap text-sm text-lk-navy">{detail.adminReply}</p>
                {detail.adminRepliedAt && (
                  <p className="mt-2 text-xs text-lk-muted">{new Date(detail.adminRepliedAt).toLocaleString()}</p>
                )}
              </div>
            )}
            <Button variant="outline" onClick={() => setDetailId(null)}>
              Close
            </Button>
          </div>
        ) : (
          <div className="p-5 text-center text-lk-muted">Loading...</div>
        )}
      </Modal>
    </div>
  );
}
