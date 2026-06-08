import { useEffect, useMemo, useState } from 'react';
import { adminApi } from '../../services/api';
import { useToast } from '../../components/ui/Toast';
import { lkNativeSelectClassName } from '../../components/ui/Select';

const CATEGORIES = [
  'Family Law',
  'Property Law',
  'Criminal Law',
  'Civil Law',
  'Rent Law',
  'Labour Law',
  'Business Law',
  'Banking Law',
  'Tax Law',
  'Consumer Law',
  'Contract Law',
  'Other',
];

const LANGUAGES = ['english', 'urdu', 'roman_urdu'];
const STATUSES = ['active', 'draft', 'archived'];

const emptyForm = {
  title: '',
  source: '',
  sourceUrl: '',
  jurisdiction: 'Pakistan',
  category: 'Other',
  actName: '',
  sectionNumber: '',
  content: '',
  summary: '',
  tags: '',
  language: 'english',
  status: 'active',
};

export default function AdminLegalKnowledge() {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [language, setLanguage] = useState('');
  const [openForm, setOpenForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<any>(emptyForm);

  const query = useMemo(() => ({ search, category, status, language, page: 1, limit: 50 }), [search, category, status, language]);

  const load = async () => {
    setLoading(true);
    try {
      const res: any = await adminApi.getLegalKnowledge(query);
      setItems(Array.isArray(res?.data) ? res.data : []);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load legal knowledge');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [search, category, status, language]);

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyForm);
  };

  const save = async () => {
    if (!form.title.trim() || !form.source.trim() || !form.content.trim()) {
      toast.error('Title, source, and content are required');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        tags: String(form.tags || '')
          .split(',')
          .map((t: string) => t.trim())
          .filter(Boolean),
      };
      if (editingId) await adminApi.updateLegalKnowledge(editingId, payload);
      else await adminApi.createLegalKnowledge(payload);
      toast.success(editingId ? 'Entry updated' : 'Entry created');
      setOpenForm(false);
      resetForm();
      load();
    } catch (err: any) {
      toast.error(err?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Legal Knowledge</h1>
          <p className="text-slate-500">Manage legal references used by AI guidance.</p>
        </div>
        <button className="rounded-lg bg-lk-accent px-4 py-2 text-sm font-medium text-white" onClick={() => { resetForm(); setOpenForm(true); }}>
          Add New
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title/content/tags" className="min-h-[46px] w-full rounded-xl border border-lk-border bg-white px-4 py-2.5 text-sm text-lk-navy shadow-sm focus:border-lk-accent focus:outline-none focus:ring-2 focus:ring-lk-accent/35" />
        <select value={category} onChange={(e) => setCategory(e.target.value)} className={lkNativeSelectClassName}>
          <option value="">All categories</option>
          {CATEGORIES.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={lkNativeSelectClassName}>
          <option value="">All statuses</option>
          {STATUSES.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <select value={language} onChange={(e) => setLanguage(e.target.value)} className={lkNativeSelectClassName}>
          <option value="">All languages</option>
          {LANGUAGES.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="grid grid-cols-12 border-b border-slate-100 px-4 py-3 text-xs font-semibold text-slate-600">
          <div className="col-span-3">Title</div><div className="col-span-2">Category</div><div className="col-span-2">Status</div><div className="col-span-2">Language</div><div className="col-span-3 text-right">Actions</div>
        </div>
        {loading ? <div className="p-4 text-sm text-slate-500">Loading...</div> : items.length === 0 ? <div className="p-4 text-sm text-slate-500">No legal knowledge entries found.</div> : items.map((row) => (
          <div key={row._id} className="grid grid-cols-12 items-center border-b border-slate-100 px-4 py-3 text-sm">
            <div className="col-span-3 font-medium text-slate-800">{row.title}</div>
            <div className="col-span-2 text-slate-600">{row.category}</div>
            <div className="col-span-2 text-slate-600">{row.status}</div>
            <div className="col-span-2 text-slate-600">{row.language}</div>
            <div className="col-span-3 text-right space-x-2">
              <button className="rounded border px-2 py-1 text-xs" onClick={() => { setEditingId(row._id); setForm({ ...row, tags: Array.isArray(row.tags) ? row.tags.join(', ') : '' }); setOpenForm(true); }}>Edit</button>
              <button className="rounded border border-red-300 px-2 py-1 text-xs text-red-600" onClick={async () => { if (!window.confirm('Delete this entry?')) return; await adminApi.deleteLegalKnowledge(row._id); load(); }}>Delete</button>
            </div>
          </div>
        ))}
      </div>

      {openForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-auto rounded-xl bg-white p-5">
            <h2 className="mb-4 text-lg font-semibold">{editingId ? 'Edit' : 'Add'} Legal Knowledge</h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {['title', 'source', 'sourceUrl', 'jurisdiction', 'actName', 'sectionNumber', 'summary', 'tags'].map((key) => (
                <input key={key} value={form[key] || ''} onChange={(e) => setForm((p: any) => ({ ...p, [key]: e.target.value }))} placeholder={key} className="min-h-[46px] w-full rounded-xl border border-lk-border bg-white px-4 py-2.5 text-sm text-lk-navy shadow-sm focus:border-lk-accent focus:outline-none focus:ring-2 focus:ring-lk-accent/35" />
              ))}
              <select value={form.category} onChange={(e) => setForm((p: any) => ({ ...p, category: e.target.value }))} className={lkNativeSelectClassName}>{CATEGORIES.map((x) => <option key={x} value={x}>{x}</option>)}</select>
              <select value={form.language} onChange={(e) => setForm((p: any) => ({ ...p, language: e.target.value }))} className={lkNativeSelectClassName}>{LANGUAGES.map((x) => <option key={x} value={x}>{x}</option>)}</select>
              <select value={form.status} onChange={(e) => setForm((p: any) => ({ ...p, status: e.target.value }))} className={lkNativeSelectClassName}>{STATUSES.map((x) => <option key={x} value={x}>{x}</option>)}</select>
            </div>
            <textarea value={form.content} onChange={(e) => setForm((p: any) => ({ ...p, content: e.target.value }))} placeholder="content" rows={7} className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <div className="mt-4 flex justify-end gap-2">
              <button className="rounded border px-4 py-2 text-sm" onClick={() => setOpenForm(false)}>Cancel</button>
              <button className="rounded bg-lk-accent px-4 py-2 text-sm text-white disabled:opacity-60" disabled={saving} onClick={save}>{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
