import { useState, useEffect } from 'react';
import { FiDownload, FiCalendar, FiUsers, FiDollarSign, FiTrendingUp, FiBarChart2, FiPieChart } from 'react-icons/fi';
import { adminApi } from '../../services/api';
import { Card, Button, Select } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import { buildEmptyMonthlySeries, hasAnalyticsSeries } from '../../utils/emptyMonthlyReport';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';

interface ReportData {
  users: {
    total: number;
    citizens: number;
    lawyers: number;
    newThisMonth: number;
    growthRate: number;
  };
  appointments: {
    total: number;
    completed: number;
    pending: number;
    cancelled: number;
    completionRate: number;
  };
  revenue: {
    total: number;
    thisMonth: number;
    lastMonth: number;
    platformFees: number;
    growthRate: number;
  };
  monthly: Array<{
    month: string;
    users: number;
    appointments: number;
    revenue: number;
  }>;
}

const COLORS = ['#2563EB', '#3b82f6', '#0F172A', '#10b981', '#ef4444'];

export default function Reports() {
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('month');
  const [data, setData] = useState<ReportData | null>(null);

  useEffect(() => {
    fetchReportData();
  }, [dateRange]);

  const fetchReportData = async () => {
    try {
      setLoading(true);
      const [dashboardRes, analyticsRes]: any[] = await Promise.all([
        adminApi.getDashboard(),
        adminApi.getAnalytics(dateRange === 'week' ? 'week' : dateRange === 'year' ? 'year' : 'month'),
      ]);
      const dash = dashboardRes?.data || dashboardRes || {};
      const usersData = dash.users || {};
      const appointmentsData = dash.appointments || {};
      const revenueData = dash.revenue || {};
      const chartData = analyticsRes?.data || {};
      const monthly = hasAnalyticsSeries(chartData) ? mergeChartData(chartData) : buildEmptyMonthlySeries();
      setData({
        users: {
          total: usersData.total ?? 0,
          citizens: usersData.citizens ?? 0,
          lawyers: usersData.verifiedLawyers ?? usersData.lawyers ?? 0,
          newThisMonth: usersData.newThisMonth ?? 0,
          growthRate: usersData.growthRate ?? 0,
        },
        appointments: {
          total: appointmentsData.total ?? 0,
          completed: appointmentsData.completed ?? 0,
          pending: appointmentsData.pending ?? 0,
          cancelled: appointmentsData.cancelled ?? 0,
          completionRate: appointmentsData.total
            ? Math.round(((appointmentsData.completed ?? 0) / appointmentsData.total) * 100)
            : 0,
        },
        revenue: {
          total: revenueData.total ?? revenueData.thisMonth ?? 0,
          thisMonth: revenueData.thisMonth ?? 0,
          lastMonth: revenueData.lastMonth ?? 0,
          platformFees: revenueData.platformEarnings ?? 0,
          growthRate: revenueData.growth ?? 0,
        },
        monthly,
      });
    } catch (error: any) {
      toast.error(error.message || 'Failed to fetch report data');
      setData({
        users: { total: 0, citizens: 0, lawyers: 0, newThisMonth: 0, growthRate: 0 },
        appointments: { total: 0, completed: 0, pending: 0, cancelled: 0, completionRate: 0 },
        revenue: { total: 0, thisMonth: 0, lastMonth: 0, platformFees: 0, growthRate: 0 },
        monthly: buildEmptyMonthlySeries(),
      });
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PK', {
      style: 'currency',
      currency: 'PKR',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const getDateRangeForExport = (): { startDate: string; endDate: string } => {
    const end = new Date();
    const start = new Date();
    if (dateRange === 'week') {
      start.setDate(start.getDate() - 7);
    } else if (dateRange === 'month') {
      start.setMonth(start.getMonth() - 1);
    } else if (dateRange === 'quarter') {
      start.setMonth(start.getMonth() - 3);
    } else {
      start.setFullYear(start.getFullYear() - 1);
    }
    return {
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    };
  };

  const [exportingCsv, setExportingCsv] = useState(false);
  const handleExportCsv = async () => {
    const { startDate, endDate } = getDateRangeForExport();
    setExportingCsv(true);
    try {
      await adminApi.downloadReportsCsv('revenue', startDate, endDate);
      toast.success('Report downloaded');
    } catch (error: any) {
      toast.error(error.message || 'Download failed');
    } finally {
      setExportingCsv(false);
    }
  };

  const handleExport = (format: 'csv' | 'pdf') => {
    if (format === 'csv') {
      handleExportCsv();
      return;
    }
    toast.info('PDF export coming soon');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-lk-accent border-t-transparent" />
      </div>
    );
  }

  const userDistribution = [
    { name: 'Citizens', value: data?.users.citizens || 0 },
    { name: 'Lawyers', value: data?.users.lawyers || 0 },
  ];

  const appointmentDistribution = [
    { name: 'Completed', value: data?.appointments.completed || 0 },
    { name: 'Pending', value: data?.appointments.pending || 0 },
    { name: 'Cancelled', value: data?.appointments.cancelled || 0 },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Reports & Analytics</h1>
          <p className="text-slate-600 mt-1">Comprehensive platform statistics and insights</p>
        </div>
        <div className="flex items-center gap-3">
          <Select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="w-40"
            options={[
              { value: 'week', label: 'This Week' },
              { value: 'month', label: 'This Month' },
              { value: 'quarter', label: 'This Quarter' },
              { value: 'year', label: 'This Year' },
            ]}
          />
          <Button
            variant="outline"
            onClick={() => handleExport('csv')}
            className="flex items-center gap-2"
            disabled={exportingCsv}
          >
            <FiDownload />
            {exportingCsv ? 'Downloading...' : 'Export CSV'}
          </Button>
          <Button onClick={() => handleExport('pdf')} className="flex items-center gap-2">
            <FiDownload />
            Export PDF
          </Button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Total Users</p>
              <p className="text-2xl font-bold text-slate-800">{data?.users.total || 0}</p>
              <p className="text-xs text-green-600 mt-1">
                +{data?.users.newThisMonth || 0} this month
              </p>
            </div>
            <div className="h-12 w-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <FiUsers className="text-blue-600 text-xl" />
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Total Appointments</p>
              <p className="text-2xl font-bold text-slate-800">{data?.appointments.total || 0}</p>
              <p className="text-xs text-green-600 mt-1">
                {data?.appointments.completionRate || 0}% completion rate
              </p>
            </div>
            <div className="h-12 w-12 bg-[#fde9c7] rounded-xl flex items-center justify-center">
              <FiCalendar className="text-lk-accent text-xl" />
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Total Revenue</p>
              <p className="text-2xl font-bold text-slate-800">{formatCurrency(data?.revenue.total || 0)}</p>
              <p className="text-xs text-green-600 mt-1">
                +{data?.revenue.growthRate || 0}% vs last month
              </p>
            </div>
            <div className="h-12 w-12 bg-green-100 rounded-xl flex items-center justify-center">
              <FiDollarSign className="text-green-600 text-xl" />
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Platform Earnings</p>
              <p className="text-2xl font-bold text-slate-800">{formatCurrency(data?.revenue.platformFees || 0)}</p>
              <p className="text-xs text-slate-500 mt-1">
                From commissions
              </p>
            </div>
            <div className="h-12 w-12 bg-purple-100 rounded-xl flex items-center justify-center">
              <FiTrendingUp className="text-purple-600 text-xl" />
            </div>
          </div>
        </Card>
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Monthly Trends */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <FiBarChart2 className="text-lk-accent" />
            Monthly Trends
          </h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.monthly || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="users" name="New Users" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="appointments" name="Appointments" fill="#2563EB" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Revenue Trend */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <FiTrendingUp className="text-green-600" />
            Revenue Trend
          </h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data?.monthly || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                <Line 
                  type="monotone" 
                  dataKey="revenue" 
                  name="Revenue"
                  stroke="#10b981" 
                  strokeWidth={3}
                  dot={{ fill: '#10b981', strokeWidth: 2, r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* User Distribution */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <FiPieChart className="text-blue-600" />
            User Distribution
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={userDistribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={5}
                  dataKey="value"
                  label={(props: any) => `${props.name ?? ''} ${((props.percent ?? 0) * 100).toFixed(0)}%`}
                >
                  {userDistribution.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-6 mt-4">
            {userDistribution.map((entry, index) => (
              <div key={entry.name} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index] }} />
                <span className="text-sm text-slate-600">{entry.name}: {entry.value}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Appointment Status */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <FiCalendar className="text-lk-accent" />
            Appointment Status
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={appointmentDistribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={5}
                  dataKey="value"
                  label={(props: any) => `${props.name ?? ''} ${((props.percent ?? 0) * 100).toFixed(0)}%`}
                >
                  {appointmentDistribution.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={[COLORS[3], COLORS[1], COLORS[4]][index]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-6 mt-4">
            {appointmentDistribution.map((entry, index) => (
              <div key={entry.name} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: [COLORS[3], COLORS[1], COLORS[4]][index] }} />
                <span className="text-sm text-slate-600">{entry.name}: {entry.value}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Detailed Stats Table */}
      <Card className="overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50">
          <h3 className="font-semibold text-slate-800">Detailed Statistics</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Metric</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Current</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Previous</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Change</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className="px-4 py-3 text-sm text-slate-800">Total Users</td>
                <td className="px-4 py-3 text-sm text-slate-800 text-right font-medium">{data?.users.total || 0}</td>
                <td className="px-4 py-3 text-sm text-slate-500 text-right">{(data?.users.total || 0) - (data?.users.newThisMonth || 0)}</td>
                <td className="px-4 py-3 text-sm text-green-600 text-right">+{data?.users.newThisMonth || 0}</td>
              </tr>
              <tr>
                <td className="px-4 py-3 text-sm text-slate-800">Completed Appointments</td>
                <td className="px-4 py-3 text-sm text-slate-800 text-right font-medium">{data?.appointments.completed || 0}</td>
                <td className="px-4 py-3 text-sm text-slate-500 text-right">-</td>
                <td className="px-4 py-3 text-sm text-green-600 text-right">{data?.appointments.completionRate || 0}%</td>
              </tr>
              <tr>
                <td className="px-4 py-3 text-sm text-slate-800">This Month Revenue</td>
                <td className="px-4 py-3 text-sm text-slate-800 text-right font-medium">{formatCurrency(data?.revenue.thisMonth || 0)}</td>
                <td className="px-4 py-3 text-sm text-slate-500 text-right">{formatCurrency(data?.revenue.lastMonth || 0)}</td>
                <td className="px-4 py-3 text-sm text-green-600 text-right">+{data?.revenue.growthRate || 0}%</td>
              </tr>
              <tr>
                <td className="px-4 py-3 text-sm text-slate-800">Platform Earnings</td>
                <td className="px-4 py-3 text-sm text-slate-800 text-right font-medium">{formatCurrency(data?.revenue.platformFees || 0)}</td>
                <td className="px-4 py-3 text-sm text-slate-500 text-right">-</td>
                <td className="px-4 py-3 text-sm text-slate-500 text-right">-</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function mergeChartData(raw: { userRegistrations?: Array<{ _id: string; count: number }>; appointmentBookings?: Array<{ _id: string; count: number }>; revenueData?: Array<{ _id: string; revenue: number }> }) {
  const ids = new Set<string>();
  (raw.userRegistrations || []).forEach((r: any) => ids.add(r._id));
  (raw.appointmentBookings || []).forEach((r: any) => ids.add(r._id));
  (raw.revenueData || []).forEach((r: any) => ids.add(r._id));
  const sorted = Array.from(ids).sort();
  return sorted.map((id) => {
    const ur = (raw.userRegistrations || []).find((r: any) => r._id === id);
    const ab = (raw.appointmentBookings || []).find((r: any) => r._id === id);
    const rv = (raw.revenueData || []).find((r: any) => r._id === id);
    return {
      month: id.length === 7 ? id.slice(5) : id.slice(0, 3),
      users: ur?.count ?? 0,
      appointments: ab?.count ?? 0,
      revenue: rv?.revenue ?? 0,
    };
  });
}
