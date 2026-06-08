import { useEffect, useState } from 'react';
import { FiAlertTriangle } from 'react-icons/fi';
import { adminApi } from '../../services/api';
import { Card, Input, Select } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';

const VIOLATION_TYPE_OPTIONS = [
  { value: '', label: 'All violation types' },
  { value: 'contact_sharing', label: 'Contact Sharing' },
];

const getUserName = (user: any) =>
  user?.citizenProfile?.fullName || user?.lawyerProfile?.fullName || user?.email || 'Unknown user';

export default function AdminChatViolations() {
  const toast = useToast();
  const [violations, setViolations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [filters, setFilters] = useState({
    violationType: '',
    senderId: '',
    appointmentId: '',
    startDate: '',
    endDate: '',
  });

  const updateFilter = (key: string, value: string) => {
    setPagination((prev) => ({ ...prev, page: 1 }));
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const loadViolations = async () => {
    setLoading(true);
    setError('');
    try {
      const response: any = await adminApi.getChatViolations({
        violationType: filters.violationType || undefined,
        senderId: filters.senderId || undefined,
        appointmentId: filters.appointmentId || undefined,
        startDate: filters.startDate || undefined,
        endDate: filters.endDate || undefined,
        page: pagination.page,
        limit: 20,
      });
      setViolations(response.data || []);
      setPagination(response.pagination || { page: 1, totalPages: 1, total: 0 });
    } catch (e: any) {
      const message = e?.message || 'Failed to load chat violations';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadViolations();
  }, [pagination.page, filters.violationType, filters.senderId, filters.appointmentId, filters.startDate, filters.endDate]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Chat Policy Violations</h1>
        <p className="text-sm text-slate-500 mt-1">
          Review blocked contact-sharing attempts and related conversation references.
        </p>
      </div>

      <Card>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          <Select
            value={filters.violationType}
            onChange={(e) => updateFilter('violationType', e.target.value)}
            options={VIOLATION_TYPE_OPTIONS}
          />
          <Input
            placeholder="Filter by sender ID"
            value={filters.senderId}
            onChange={(e) => updateFilter('senderId', e.target.value)}
          />
          <Input
            placeholder="Filter by appointment ID"
            value={filters.appointmentId}
            onChange={(e) => updateFilter('appointmentId', e.target.value)}
          />
          <Input
            type="date"
            value={filters.startDate}
            onChange={(e) => updateFilter('startDate', e.target.value)}
          />
          <Input
            type="date"
            value={filters.endDate}
            onChange={(e) => updateFilter('endDate', e.target.value)}
          />
        </div>
      </Card>

      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">Date/Time</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">Sender</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">Receiver</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">Type</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">Message Excerpt</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">Refs</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-500">Loading chat violations...</td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-red-500">{error}</td>
                </tr>
              ) : violations.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-500">
                    <FiAlertTriangle className="mx-auto mb-2 text-3xl text-slate-300" />
                    No chat policy violations found.
                  </td>
                </tr>
              ) : (
                violations.map((item) => (
                  <tr key={item._id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 px-4 text-sm text-slate-600">
                      {new Date(item.createdAt).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-700">
                      <div className="font-medium">{getUserName(item.senderId)}</div>
                      <div className="text-xs text-slate-500">{item.senderId?.email || '-'}</div>
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-700">
                      <div className="font-medium">{getUserName(item.receiverId)}</div>
                      <div className="text-xs text-slate-500">{item.receiverId?.email || '-'}</div>
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-600 capitalize">
                      {(item.violationType || '').replace('_', ' ')}
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-700 max-w-xs">
                      <div className="truncate" title={item.messageExcerpt}>
                        {item.messageExcerpt}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600">
                      <div>Appointment: {item.appointmentId || '-'}</div>
                      <div>Conversation: {item.conversationId || '-'}</div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {pagination.totalPages > 1 && (
          <div className="flex justify-center gap-2 p-4 border-t border-slate-100">
            {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map((page) => (
              <button
                key={page}
                onClick={() => setPagination((prev) => ({ ...prev, page }))}
                className={`h-8 w-8 rounded-lg text-sm font-medium ${
                  page === pagination.page
                    ? 'bg-gradient-to-r from-lk-navy to-[#1e3a8f] text-white shadow-sm'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {page}
              </button>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
