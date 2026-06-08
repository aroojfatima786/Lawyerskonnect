import { useEffect, useState } from 'react';
import { FiDollarSign, FiRefreshCw } from 'react-icons/fi';
import { adminApi } from '../../services/api';
import { Card, Button, Select, StatusBadge, Badge, Modal, Textarea } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';

export default function AdminPayments() {
  const toast = useToast();
  const [payments, setPayments] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({});
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ status: '', method: '' });
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [selectedPayment, setSelectedPayment] = useState<any>(null);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundReason, setRefundReason] = useState('');
  const [processing, setProcessing] = useState(false);
  const [payouts, setPayouts] = useState<any[]>([]);

  useEffect(() => {
    loadPayments();
    loadWallet();
    loadPayouts();
  }, [filters, pagination.page]);

  const loadWallet = async () => {
    try {
      const res: any = await adminApi.getPlatformWallet();
      setWalletBalance(res?.data?.balancePkr ?? 0);
      setSummary((prev: any) => ({ ...(prev || {}), ...(res?.data || {}) }));
    } catch {
      setWalletBalance(0);
    }
  };

  const loadPayments = async () => {
    setLoading(true);
    try {
      const response: any = await adminApi.getAllPayments({
        ...filters,
        page: pagination.page,
        limit: 20,
      });
      setPayments(response.data || []);
      setSummary(response.summary || {});
      setPagination(response.pagination || { page: 1, totalPages: 1, total: 0 });
    } catch (error) {
      console.error('Failed to load payments:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPayouts = async () => {
    try {
      const response: any = await adminApi.getPayouts({ page: 1, limit: 50 });
      setPayouts(response.data || []);
    } catch (error) {
      console.error('Failed to load payouts:', error);
      setPayouts([]);
    }
  };

  const handleRefund = async () => {
    if (!selectedPayment || !refundReason) return;
    setProcessing(true);
    try {
      await adminApi.processRefund(selectedPayment._id, refundReason);
      toast.success('Refund processed');
      setShowRefundModal(false);
      setRefundReason('');
      setSelectedPayment(null);
      loadPayments();
    } catch (error: any) {
      toast.error(error.message || 'Failed to process refund');
    } finally {
      setProcessing(false);
    }
  };

  const getMethodLabel = (method: string) => {
    const labels: Record<string, string> = {
      jazzcash: 'JazzCash',
      easypaisa: 'EasyPaisa',
      card: 'Card',
      bank_transfer: 'Bank Transfer',
    };
    return labels[method] || method;
  };

  const getClientDisplay = (payment: any) => {
    if (payment?.type === 'subscription_fee') {
      const name =
        payment.lawyerId?.lawyerProfile?.fullName ||
        payment.lawyerId?.email ||
        'Lawyer';
      return {
        primary: 'Subscription',
        secondary: name,
        isSubscription: true,
      };
    }
    return {
      primary: payment.citizenId?.citizenProfile?.fullName || 'N/A',
      secondary: payment.citizenId?.email || '',
      isSubscription: false,
    };
  };

  const getLawyerDisplay = (payment: any) => {
    if (payment?.type === 'subscription_fee') {
      return '—';
    }
    return payment.lawyerId?.lawyerProfile?.fullName || 'N/A';
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">Payment Management</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-indigo-100 flex items-center justify-center">
            <FiDollarSign className="text-indigo-600 text-xl" />
          </div>
          <div>
            <div className="text-xl font-bold text-slate-800">
              PKR {(walletBalance || summary.balancePkr || 0).toLocaleString()}
            </div>
            <div className="text-sm text-slate-500">App Wallet Balance</div>
          </div>
        </Card>
        <Card className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-green-100 flex items-center justify-center">
            <FiDollarSign className="text-green-600 text-xl" />
          </div>
          <div>
            <div className="text-xl font-bold text-slate-800">
              PKR {(summary.totalReceived || summary.totalRevenue || 0).toLocaleString()}
            </div>
            <div className="text-sm text-slate-500">Received Payments</div>
          </div>
        </Card>

        <Card className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-blue-50 flex items-center justify-center">
            <FiDollarSign className="text-lk-accent text-xl" />
          </div>
          <div>
            <div className="text-xl font-bold text-slate-800">
              PKR {(summary.escrowHeld || 0).toLocaleString()}
            </div>
            <div className="text-sm text-slate-500">Held in Escrow</div>
          </div>
        </Card>

        <Card className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-blue-100 flex items-center justify-center">
            <FiDollarSign className="text-blue-600 text-xl" />
          </div>
          <div>
            <div className="text-xl font-bold text-slate-800">
              PKR {(summary.eligiblePayouts || 0).toLocaleString()}
            </div>
            <div className="text-sm text-slate-500">Eligible Payouts</div>
          </div>
        </Card>

        <Card className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-purple-100 flex items-center justify-center">
            <FiDollarSign className="text-purple-600 text-xl" />
          </div>
          <div>
            <div className="text-xl font-bold text-slate-800">PKR {(summary.platformRevenue || summary.platformEarnings || 0).toLocaleString()}</div>
            <div className="text-sm text-slate-500">Platform Revenue</div>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <div className="flex flex-wrap gap-4">
          <Select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            options={[
              { value: '', label: 'All Status' },
              { value: 'completed', label: 'Completed' },
              { value: 'pending', label: 'Pending' },
              { value: 'failed', label: 'Failed' },
              { value: 'refunded', label: 'Refunded' },
            ]}
          />
          <Select
            value={filters.method}
            onChange={(e) => setFilters({ ...filters, method: e.target.value })}
            options={[
              { value: '', label: 'All Methods' },
              { value: 'jazzcash', label: 'JazzCash' },
              { value: 'easypaisa', label: 'EasyPaisa' },
              { value: 'card', label: 'Card' },
              { value: 'bank_transfer', label: 'Bank Transfer' },
            ]}
          />
          <Button onClick={loadPayments}>Filter</Button>
        </div>
      </Card>

      {/* Payments Table */}
      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">Date</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">Client</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">Lawyer</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">Method</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">Amount</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">Status</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">Loading...</td>
                </tr>
              ) : payments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">No payments found</td>
                </tr>
              ) : (
                payments.map((payment) => (
                  <tr key={payment._id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 px-4">
                      <div className="text-sm">{new Date(payment.createdAt).toLocaleDateString()}</div>
                      <div className="text-xs text-slate-500">{new Date(payment.createdAt).toLocaleTimeString()}</div>
                    </td>
                    <td className="py-3 px-4">
                      {(() => {
                        const client = getClientDisplay(payment);
                        return (
                          <>
                            <div className={`text-sm font-medium ${client.isSubscription ? 'text-indigo-700' : ''}`}>
                              {client.primary}
                            </div>
                            {client.secondary && (
                              <div className="text-xs text-slate-500">{client.secondary}</div>
                            )}
                          </>
                        );
                      })()}
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-sm font-medium">{getLawyerDisplay(payment)}</div>
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant="secondary" size="sm">{getMethodLabel(payment.method)}</Badge>
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-sm font-semibold">PKR {payment.amount.toLocaleString()}</div>
                      <div className="text-xs text-slate-500">Fee: PKR {payment.platformFeeAmount}</div>
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge status={payment.status} />
                    </td>
                    <td className="py-3 px-4">
                      {payment.status === 'completed' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedPayment(payment);
                            setShowRefundModal(true);
                          }}
                        >
                          <FiRefreshCw className="mr-1" /> Refund
                        </Button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex justify-center gap-2 p-4 border-t border-slate-100">
            {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map((page) => (
              <button
                key={page}
                onClick={() => setPagination({ ...pagination, page })}
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

      <Card>
        <h2 className="text-lg font-semibold text-slate-800 mb-1">Payouts</h2>
        <p className="mb-4 text-sm text-slate-500">
          Lawyer earnings are auto-released when a consultation is marked complete (if the lawyer has a payout account saved).
        </p>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">Lawyer</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">Gross</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">Fee</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">Net</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">Method</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">Status</th>
              </tr>
            </thead>
            <tbody>
              {payouts.length === 0 ? (
                <tr><td colSpan={6} className="py-6 text-center text-slate-500">No payouts found</td></tr>
              ) : (
                payouts.map((p) => (
                  <tr key={p._id} className="border-b border-slate-100">
                    <td className="py-3 px-4 text-sm">{p.lawyerId?.lawyerProfile?.fullName || p.lawyerId?.email || 'Lawyer'}</td>
                    <td className="py-3 px-4 text-sm">PKR {(p.grossAmount || 0).toLocaleString()}</td>
                    <td className="py-3 px-4 text-sm">PKR {(p.platformFee || 0).toLocaleString()}</td>
                    <td className="py-3 px-4 text-sm font-semibold">PKR {(p.netAmount || 0).toLocaleString()}</td>
                    <td className="py-3 px-4 text-sm capitalize">{p.payoutMethod || '-'}</td>
                    <td className="py-3 px-4 text-sm">
                      <StatusBadge status={p.status} />
                      {p.status === 'pending' && (
                        <p className="mt-1 text-xs text-amber-700">Waiting for lawyer payout account</p>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Refund Modal */}
      <Modal
        isOpen={showRefundModal}
        onClose={() => {
          setShowRefundModal(false);
          setRefundReason('');
          setSelectedPayment(null);
        }}
        title="Process Refund"
      >
        {selectedPayment && (
          <div className="p-6">
            <div className="bg-slate-50 rounded-lg p-4 mb-4">
              <div className="flex justify-between mb-2">
                <span className="text-slate-600">Amount</span>
                <span className="font-bold">PKR {selectedPayment.amount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Reference</span>
                <span className="font-mono text-sm">{selectedPayment.referenceNumber}</span>
              </div>
            </div>

            <Textarea
              label="Refund Reason"
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              placeholder="Enter reason for refund..."
              rows={4}
              required
            />

            <div className="flex gap-3 mt-6">
              <Button
                variant="danger"
                onClick={handleRefund}
                isLoading={processing}
                disabled={!refundReason}
                className="flex-1"
              >
                Process Refund
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowRefundModal(false);
                  setRefundReason('');
                }}
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
