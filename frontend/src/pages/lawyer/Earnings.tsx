import { useState, useEffect } from 'react';
import { FiDollarSign, FiTrendingUp, FiCalendar, FiClock, FiDownload } from 'react-icons/fi';
import { paymentApi } from '../../services/api';
import { Card, Button, Select, StatusLabel } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';

interface Payment {
  _id: string;
  amount: number;
  platformFee?: number;
  platformFeeAmount?: number;
  lawyerAmount: number;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  paymentMethod: string;
  createdAt: string;
  escrowStatus?: string;
  payoutId?: any;
  citizenId?: {
    citizenProfile?: { fullName?: string };
    email?: string;
  };
  appointmentId?: {
    _id: string;
    appointmentDate?: string;
    startTime?: string;
    status?: string;
    consultationType?: string;
  };
}

export default function Earnings() {
  const toast = useToast();

  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('all');

  useEffect(() => {
    fetchEarnings();
  }, []);

  const fetchEarnings = async () => {
    try {
      setLoading(true);
      const response: any = await paymentApi.getPayments({ page: 1, limit: 100 });
      // API returns backend body: { success, data: payments[], summary, pagination }
      const list = Array.isArray(response?.data) ? response.data : [];
      setPayments(list);
    } catch (error: any) {
      toast.error(error?.response?.data?.message || error.message || 'Failed to fetch earnings');
    } finally {
      setLoading(false);
    }
  };

  // Filter: only completed for earnings; then by time range
  const filteredPayments = payments
    .filter((p) => p.status === 'completed')
    .filter((payment) => {
      if (timeRange === 'all') return true;
      const paymentDate = new Date(payment.createdAt);
      const now = new Date();
      switch (timeRange) {
        case 'week':
          const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          return paymentDate >= weekAgo;
        case 'month':
          const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          return paymentDate >= monthAgo;
        case 'year':
          const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
          return paymentDate >= yearAgo;
        default:
          return true;
      }
    });

  // Calculate stats
  const totalEarnings = filteredPayments.reduce(
    (acc, p) => acc + (p.escrowStatus === 'released' ? (p.lawyerAmount || p.amount - ((p.platformFee ?? p.platformFeeAmount) || 0)) : 0),
    0,
  );
  const totalTransactions = filteredPayments.length;
  const heldInEscrow = filteredPayments.reduce(
    (acc, p) => acc + (p.escrowStatus === 'held' ? (p.lawyerAmount || 0) : 0),
    0,
  );
  const eligiblePayout = filteredPayments.reduce(
    (acc, p) => acc + (p.escrowStatus === 'eligible_for_release' ? (p.lawyerAmount || 0) : 0),
    0,
  );

  // Group by month for chart data
  const monthlyData = filteredPayments.reduce((acc: Record<string, number>, payment) => {
    const month = new Date(payment.createdAt).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    acc[month] = (acc[month] || 0) + (payment.lawyerAmount || payment.amount - (payment.platformFee || 0));
    return acc;
  }, {});

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const platformFee = (p: Payment) => p.platformFee ?? p.platformFeeAmount ?? 0;

  const clientLabel = (payment: Payment) => {
    const citizen = payment.citizenId;
    return citizen?.citizenProfile?.fullName || citizen?.email?.split('@')[0] || 'Client';
  };

  const clientInitial = (payment: Payment) => clientLabel(payment).charAt(0).toUpperCase();

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PK', {
      style: 'currency',
      currency: 'PKR',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-lk-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-lk-muted">
          Released, held, and eligible amounts are based on completed payments in the selected period.
        </p>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <Select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="min-w-[11rem]"
            options={[
              { value: 'all', label: 'All Time' },
              { value: 'week', label: 'This Week' },
              { value: 'month', label: 'This Month' },
              { value: 'year', label: 'This Year' },
            ]}
          />
          <Button className="flex min-h-[46px] w-full items-center justify-center gap-2 sm:w-auto">
            <FiDownload />
            Export
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-6 shadow-lk-card">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm text-lk-muted">Released payout</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-lk-navy">{formatCurrency(totalEarnings)}</p>
            </div>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-50">
              <FiDollarSign className="text-xl text-emerald-700" />
            </div>
          </div>
        </Card>

        <Card className="p-6 shadow-lk-card">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm text-lk-muted">Held in escrow</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-lk-navy">{formatCurrency(heldInEscrow)}</p>
            </div>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sky-50">
              <FiCalendar className="text-xl text-sky-700" />
            </div>
          </div>
        </Card>

        <Card className="p-6 shadow-lk-card">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm text-lk-muted">Eligible for release</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-lk-navy">{formatCurrency(eligiblePayout)}</p>
            </div>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50">
              <FiTrendingUp className="text-xl text-lk-accent" />
            </div>
          </div>
        </Card>

        <Card className="p-6 shadow-lk-card">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm text-lk-muted">Completed payments</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-lk-navy">{totalTransactions}</p>
            </div>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-100">
              <FiClock className="text-xl text-lk-navy" />
            </div>
          </div>
        </Card>
      </div>

      {/* Monthly Breakdown */}
      {Object.keys(monthlyData).length > 0 && (
        <Card className="overflow-hidden p-6 shadow-lk-card">
          <h2 className="text-lg font-semibold text-lk-navy">Monthly breakdown</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {Object.entries(monthlyData).map(([month, amount]) => (
              <div key={month} className="rounded-xl border border-slate-200/90 bg-slate-50/80 p-4 text-center ring-1 ring-slate-100/80">
                <p className="text-xs font-medium text-lk-muted">{month}</p>
                <p className="mt-1 text-sm font-semibold text-lk-navy">{formatCurrency(amount)}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Transactions List */}
      <Card className="overflow-hidden shadow-lk-card-lg ring-1 ring-slate-100/80">
        <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
          <h2 className="text-lg font-semibold text-lk-navy">Recent transactions</h2>
          <p className="mt-0.5 text-sm text-lk-muted">
            Completed payments only. Payouts auto-release when you mark a consultation complete.
          </p>
        </div>
        
        {filteredPayments.length === 0 ? (
          <div className="p-12 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-slate-200 bg-slate-50">
              <FiDollarSign className="text-2xl text-lk-muted" />
            </div>
            <h3 className="text-lg font-semibold text-lk-navy">No transactions yet</h3>
            <p className="mt-1 text-sm text-lk-muted">Complete consultations to start earning.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead className="bg-slate-50/90">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-lk-muted sm:px-6">
                    Client
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-lk-muted sm:px-6">
                    Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-lk-muted sm:px-6">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-lk-muted sm:px-6">
                    Gross
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-lk-muted sm:px-6">
                    Platform fee
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-lk-muted sm:px-6">
                    Net
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-lk-muted sm:px-6">
                    Escrow
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPayments.map((payment) => (
                  <tr key={payment._id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-4 sm:px-6">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-lk-navy text-sm font-medium text-white">
                          {clientInitial(payment)}
                        </div>
                        <span className="text-sm font-medium text-lk-navy">{clientLabel(payment)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-lk-muted sm:px-6">
                      {formatDate(payment.createdAt)}
                    </td>
                    <td className="px-4 py-4 text-sm text-lk-navy sm:px-6">
                      {payment.appointmentId?.consultationType || 'Consultation'}
                    </td>
                    <td className="px-4 py-4 text-sm font-medium text-lk-navy sm:px-6">
                      {formatCurrency(payment.amount)}
                    </td>
                    <td className="px-4 py-4 text-sm text-red-600/90 sm:px-6">
                      -{formatCurrency(platformFee(payment))}
                    </td>
                    <td className="px-4 py-4 text-sm font-semibold text-emerald-700 sm:px-6">
                      {formatCurrency(payment.lawyerAmount || payment.amount - platformFee(payment))}
                    </td>
                    <td className="px-4 py-4 sm:px-6">
                      {payment.escrowStatus ? (
                        <StatusLabel status={String(payment.escrowStatus)} />
                      ) : (
                        <StatusLabel status={payment.status} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Payout Info */}
      <Card className="overflow-hidden bg-gradient-to-r from-lk-navy via-[#152a4a] to-[#0f2744] p-6 text-white shadow-lk-card-lg sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold">Payout method</h3>
            <p className="mt-1 text-sm text-white/80">
              Payments are held in escrow and auto-released when you mark a consultation complete.
            </p>
          </div>
          <Button className="shrink-0 shadow-lg shadow-black/20" onClick={() => (window.location.href = '/lawyer/profile?tab=payment')}>
            Update payout account
          </Button>
        </div>
      </Card>
    </div>
  );
}
