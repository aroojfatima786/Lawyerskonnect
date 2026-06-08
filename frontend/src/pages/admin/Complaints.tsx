import { useEffect, useState } from 'react';
import { FiMessageCircle, FiEye } from 'react-icons/fi';
import { adminApi } from '../../services/api';
import { Card, Button, Textarea, Modal } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import { lkNativeSelectClassName } from '../../components/ui/Select';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];

const CATEGORY_OPTIONS = [
  { value: '', label: 'All categories' },
  { value: 'general', label: 'General' },
  { value: 'payment', label: 'Payment' },
  { value: 'appointment', label: 'Appointment' },
  { value: 'lawyer', label: 'Lawyer' },
  { value: 'technical', label: 'Technical' },
  { value: 'other', label: 'Other' },
];

const STATUS_BADGE: Record<string, string> = {
  open: 'bg-amber-100 text-amber-800',
  in_progress: 'bg-blue-100 text-blue-800',
  resolved: 'bg-green-100 text-green-800',
  closed: 'bg-slate-100 text-slate-700',
};

export default function AdminComplaints() {
  const toast = useToast();
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ status: '', category: '' });
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [updateStatus, setUpdateStatus] = useState('');
  const [adminReply, setAdminReply] = useState('');
  const [saving, setSaving] = useState(false);

  const loadList = async () => {
    setLoading(true);
    try {
      const res: any = await adminApi.getComplaints({
        status: filters.status || undefined,
        category: filters.category || undefined,
        limit: 50,
      });
      setList(res.data || []);
    } catch (e) {
      toast.error('Failed to load complaints');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadList();
  }, [filters.status, filters.category]);

  useEffect(() => {
    if (!detailId) {
      setDetail(null);
      setUpdateStatus('');
      setAdminReply('');
      return;
    }
    adminApi
      .getComplaintById(detailId)
      .then((res: any) => {
        setDetail(res.data);
        setUpdateStatus(res.data?.status || '');
        setAdminReply(res.data?.adminReply || '');
      })
      .catch(() => toast.error('Failed to load complaint'));
  }, [detailId]);

  const handleSave = async () => {
    if (!detailId) return;
    setSaving(true);
    try {
      await adminApi.updateComplaint(detailId, {
        ...(updateStatus && updateStatus !== detail?.status ? { status: updateStatus } : {}),
        ...(adminReply !== (detail?.adminReply || '') ? { adminReply: adminReply.trim() || undefined } : {}),
      });
      toast.success('Complaint updated');
      setDetailId(null);
      loadList();
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const userName = (u: any) =>
    u?.citizenProfile?.fullName || u?.lawyerProfile?.fullName || u?.email?.split('@')[0] || 'User';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Complaint Management</h1>
          <p className="text-sm text-slate-500 mt-0.5">View and respond to user complaints and reports.</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          className={lkNativeSelectClassName}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          value={filters.category}
          onChange={(e) => setFilters({ ...filters, category: e.target.value })}
          className={lkNativeSelectClassName}
        >
          {CATEGORY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <Card padding="none" className="overflow-hidden">
        {loading ? (
          <div className="py-10 text-center text-slate-500">Loading...</div>
        ) : list.length === 0 ? (
          <div className="py-10 text-center">
            <FiMessageCircle className="mx-auto text-4xl text-slate-300 mb-2" />
            <p className="text-slate-600">No complaints match the filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-slate-600">User</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-slate-600">Subject</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-slate-600 w-24">Category</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-slate-600 w-24">Status</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-slate-600 w-28">Date</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-slate-600 w-20">Actions</th>
                </tr>
              </thead>
              <tbody>
                {list.map((c) => (
                  <tr key={c._id} className="border-b border-slate-100 hover:bg-slate-50/80">
                    <td className="py-2 px-3 text-sm text-slate-700">
                      {userName(c.userId)}
                      {c.userId?.email && (
                        <div className="text-xs text-slate-500 truncate max-w-[140px]">{c.userId.email}</div>
                      )}
                    </td>
                    <td className="py-2 px-3">
                      <div className="font-medium text-slate-800 text-sm truncate max-w-[200px]">{c.subject}</div>
                      <div className="text-xs text-slate-500 truncate max-w-[200px]">{c.message}</div>
                    </td>
                    <td className="py-2 px-3 text-sm text-slate-600 capitalize">{c.category}</td>
                    <td className="py-2 px-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[c.status] || STATUS_BADGE.open}`}>
                        {c.status?.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-xs text-slate-500">{new Date(c.createdAt).toLocaleDateString()}</td>
                    <td className="py-2 px-3">
                      <button
                        onClick={() => setDetailId(c._id)}
                        className="p-1.5 hover:bg-slate-100 rounded text-slate-600"
                        title="View / Reply"
                      >
                        <FiEye size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Detail / Reply modal */}
      <Modal isOpen={!!detailId} onClose={() => setDetailId(null)} title="Complaint detail">
        {detail ? (
          <div className="p-5 space-y-4">
            <div>
              <div className="text-sm text-slate-500">From: {userName(detail.userId)} {detail.userId?.email && `(${detail.userId.email})`}</div>
              <div className="font-medium text-slate-800 mt-1">{detail.subject}</div>
              <div className="text-xs text-slate-500 mt-0.5 capitalize">{detail.category} · {new Date(detail.createdAt).toLocaleString()}</div>
            </div>
            <p className="text-slate-600 whitespace-pre-wrap border-l-2 border-slate-200 pl-3">{detail.message}</p>

            {detail.adminReply && (
              <div className="bg-slate-50 rounded-xl p-3 text-sm">
                <p className="text-xs font-semibold text-slate-500 mb-1">Current admin response</p>
                <p className="text-slate-700 whitespace-pre-wrap">{detail.adminReply}</p>
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Status</label>
              <select
                value={updateStatus}
                onChange={(e) => setUpdateStatus(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              >
                {STATUS_OPTIONS.filter((o) => o.value).map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Admin reply (optional)</label>
              <Textarea
                value={adminReply}
                onChange={(e) => setAdminReply(e.target.value)}
                placeholder="Type your response to the user..."
                rows={4}
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={handleSave} isLoading={saving}>Save changes</Button>
              <Button variant="outline" onClick={() => setDetailId(null)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div className="p-5 text-center text-slate-500">Loading...</div>
        )}
      </Modal>
    </div>
  );
}
