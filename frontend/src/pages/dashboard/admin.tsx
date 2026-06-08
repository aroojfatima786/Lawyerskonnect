import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  FiUsers,
  FiCheckSquare,
  FiDollarSign,
  FiStar,
  FiCalendar,
  FiDownload,
  FiBarChart2,
  FiTrendingUp,
  FiPieChart,
  FiMail,
} from 'react-icons/fi';
import { adminApi } from '../../services/api';
import { Card, Badge, Button, Select } from '../../components/ui';
import { buildEmptyMonthlySeries, hasAnalyticsSeries } from '../../utils/emptyMonthlyReport';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

const COLORS = ['#2563EB', '#3b82f6', '#0F172A', '#10b981', '#ef4444'];

interface ReportData {
  users: { total: number; citizens: number; lawyers: number; newThisMonth: number; growthRate: number };
  appointments: { total: number; completed: number; pending: number; cancelled: number; completionRate: number };
  revenue: { total: number; thisMonth: number; lastMonth: number; platformFees: number; growthRate: number };
  monthly: Array<{ month: string; users: number; appointments: number; revenue: number }>;
}

function mergeChartData(raw: any) {
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

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', minimumFractionDigits: 0 }).format(amount);
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<any>(null);
  const [dateRange, setDateRange] = useState('month');
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [integrations, setIntegrations] = useState<any>(null);

  useEffect(() => {
    adminApi
      .getIntegrationsOverview()
      .then((r: any) => setIntegrations(r?.data ?? null))
      .catch(() => setIntegrations(null));
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [dashboardRes, analyticsRes]: any[] = await Promise.all([
        adminApi.getDashboard(),
        adminApi.getAnalytics(dateRange === 'week' ? 'week' : dateRange === 'year' ? 'year' : 'month'),
      ]);
      const dash = dashboardRes?.data || dashboardRes || {};
      const chartData = analyticsRes?.data || {};
      const monthly = hasAnalyticsSeries(chartData) ? mergeChartData(chartData) : buildEmptyMonthlySeries();
      setStats(dash);
      setData({
        users: {
          total: dash.users?.total ?? 0,
          citizens: dash.users?.citizens ?? 0,
          lawyers: dash.users?.verifiedLawyers ?? dash.users?.lawyers ?? 0,
          newThisMonth: dash.users?.newThisMonth ?? 0,
          growthRate: dash.users?.growthRate ?? 0,
        },
        appointments: {
          total: dash.appointments?.total ?? 0,
          completed: dash.appointments?.completed ?? 0,
          pending: dash.appointments?.pending ?? 0,
          cancelled: dash.appointments?.cancelled ?? 0,
          completionRate: dash.appointments?.total
            ? Math.round(((dash.appointments?.completed ?? 0) / dash.appointments.total) * 100)
            : 0,
        },
        revenue: {
          total: dash.revenue?.total ?? dash.revenue?.thisMonth ?? 0,
          thisMonth: dash.revenue?.thisMonth ?? 0,
          lastMonth: dash.revenue?.lastMonth ?? 0,
          platformFees: dash.revenue?.platformEarnings ?? 0,
          growthRate: dash.revenue?.growth ?? 0,
        },
        monthly,
      });
    } catch (error) {
      console.error('Failed to load dashboard:', error);
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

  useEffect(() => {
    loadData();
  }, [dateRange]);

  const handleExportCsv = async () => {
    const end = new Date();
    const start = new Date();
    if (dateRange === 'week') start.setDate(start.getDate() - 7);
    else if (dateRange === 'month') start.setMonth(start.getMonth() - 1);
    else start.setFullYear(start.getFullYear() - 1);
    setExportingCsv(true);
    try {
      await adminApi.downloadReportsCsv('revenue', start.toISOString().slice(0, 10), end.toISOString().slice(0, 10));
    } finally {
      setExportingCsv(false);
    }
  };

  if (loading && !data) {
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
    <div className="space-y-6">
      {/* Reports & Analytics header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Reports & Analytics</h1>
          <p className="text-sm text-slate-500 mt-0.5">Platform statistics and insights</p>
        </div>
        <div className="flex items-center gap-3">
          <Select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="w-36"
            options={[
              { value: 'week', label: 'This Week' },
              { value: 'month', label: 'This Month' },
              { value: 'year', label: 'This Year' },
            ]}
          />
          <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={exportingCsv}>
            <FiDownload className="mr-1" />
            {exportingCsv ? '...' : 'Export CSV'}
          </Button>
        </div>
      </div>

      {integrations ? (
        <Card className="border border-slate-200 bg-gradient-to-r from-slate-50 to-blue-50/40 p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
                <FiMail className="text-lg text-lk-accent" aria-hidden />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Notifications & payments (environment)</p>
                <p className="mt-1 text-sm text-slate-700">
                  Email <span className="font-semibold">{integrations.emailProvider}</span>
                  {integrations.emailIsMockOrDev ? (
                    <span className="text-slate-500"> — demo (logged to server console only)</span>
                  ) : null}
                  {' · '}
                  SMS <span className="font-semibold">{integrations.smsProvider}</span>
                  {integrations.smsInactive ? (
                    <span className="text-slate-500"> — disabled</span>
                  ) : integrations.smsIsMock ? (
                    <span className="text-slate-500"> — demo log only</span>
                  ) : null}
                  {integrations.smsProvider === 'twilio' && !integrations.twilioReady ? (
                    <span className="text-amber-800"> — Twilio credentials incomplete</span>
                  ) : null}
                </p>
                <p className="mt-1 text-sm text-slate-700">
                  Checkout mode <span className="font-semibold capitalize">{integrations.paymentProvider}</span>
                  {integrations.paymentProvider === 'manual' ? (
                    <span className="text-slate-500"> — manual / demo flows on checkout</span>
                  ) : null}
                  {' · '}
                  JazzCash env {integrations.jazzcashConfigured ? (
                    <span className="text-emerald-700">ready</span>
                  ) : (
                    <span className="text-slate-500">incomplete</span>
                  )}
                  {' · '}
                  EasyPaisa env {integrations.easypaisaConfigured ? (
                    <span className="text-emerald-700">ready</span>
                  ) : (
                    <span className="text-slate-500">incomplete</span>
                  )}
                </p>
                {Array.isArray(integrations.notes) && integrations.notes.length > 0 ? (
                  <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-slate-600">
                    {integrations.notes.map((n: string, i: number) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          </div>
        </Card>
      ) : null}

      {/* Key Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Total Users</p>
              <p className="text-xl font-bold text-slate-800">{data?.users.total ?? 0}</p>
              <p className="text-xs text-green-600 mt-0.5">+{data?.users.newThisMonth ?? 0} this month</p>
            </div>
            <div className="h-11 w-11 bg-blue-100 rounded-xl flex items-center justify-center">
              <FiUsers className="text-blue-600 text-lg" />
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Total Appointments</p>
              <p className="text-xl font-bold text-slate-800">{data?.appointments.total ?? 0}</p>
              <p className="text-xs text-green-600 mt-0.5">{data?.appointments.completionRate ?? 0}% completion</p>
            </div>
            <div className="h-11 w-11 bg-[#fde9c7] rounded-xl flex items-center justify-center">
              <FiCalendar className="text-lk-accent text-lg" />
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Total Revenue</p>
              <p className="text-xl font-bold text-slate-800">{formatCurrency(data?.revenue.total ?? 0)}</p>
              <p className="text-xs text-green-600 mt-0.5">+{data?.revenue.growthRate ?? 0}% vs last month</p>
            </div>
            <div className="h-11 w-11 bg-green-100 rounded-xl flex items-center justify-center">
              <FiDollarSign className="text-green-600 text-lg" />
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Platform Earnings</p>
              <p className="text-xl font-bold text-slate-800">{formatCurrency(data?.revenue.platformFees ?? 0)}</p>
            </div>
            <div className="h-11 w-11 bg-purple-100 rounded-xl flex items-center justify-center">
              <FiTrendingUp className="text-purple-600 text-lg" />
            </div>
          </div>
        </Card>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-5">
          <h3 className="text-base font-semibold text-slate-800 mb-3 flex items-center gap-2">
            <FiBarChart2 className="text-lk-accent" />
            Monthly Trends
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.monthly || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="users" name="New Users" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="appointments" name="Appointments" fill="#2563EB" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-5">
          <h3 className="text-base font-semibold text-slate-800 mb-3 flex items-center gap-2">
            <FiTrendingUp className="text-green-600" />
            Revenue Trend
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data?.monthly || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#10b981" strokeWidth={2} dot={{ fill: '#10b981', r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Pie charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-5">
          <h3 className="text-base font-semibold text-slate-800 mb-3 flex items-center gap-2">
            <FiPieChart className="text-blue-600" />
            User Distribution
          </h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={userDistribution}
                  cx="50%" cy="50%"
                  innerRadius={50} outerRadius={75}
                  paddingAngle={4}
                  dataKey="value"
                  label={(props: any) => `${props.name ?? ''} ${((props.percent ?? 0) * 100).toFixed(0)}%`}
                >
                  {userDistribution.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-4 mt-2">
            {userDistribution.map((entry, i) => (
              <div key={entry.name} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i] }} />
                <span className="text-xs text-slate-600">{entry.name}: {entry.value}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-5">
          <h3 className="text-base font-semibold text-slate-800 mb-3 flex items-center gap-2">
            <FiCalendar className="text-lk-accent" />
            Appointment Status
          </h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={appointmentDistribution}
                  cx="50%" cy="50%"
                  innerRadius={50} outerRadius={75}
                  paddingAngle={4}
                  dataKey="value"
                  label={(props: any) => `${props.name ?? ''} ${((props.percent ?? 0) * 100).toFixed(0)}%`}
                >
                  {appointmentDistribution.map((_, i) => (
                    <Cell key={i} fill={[COLORS[3], COLORS[1], COLORS[4]][i]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-4 mt-2">
            {appointmentDistribution.map((entry, i) => (
              <div key={entry.name} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: [COLORS[3], COLORS[1], COLORS[4]][i] }} />
                <span className="text-xs text-slate-600">{entry.name}: {entry.value}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Detailed stats table */}
      <Card padding="none" className="overflow-hidden">
        <div className="p-3 border-b border-slate-100 bg-slate-50">
          <h3 className="font-semibold text-slate-800 text-sm">Detailed Statistics</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase">Metric</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 uppercase">Current</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 uppercase">Previous</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 uppercase">Change</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className="px-3 py-2 text-slate-800">Total Users</td>
                <td className="px-3 py-2 text-right font-medium">{data?.users.total ?? 0}</td>
                <td className="px-3 py-2 text-right text-slate-500">{(data?.users.total ?? 0) - (data?.users.newThisMonth ?? 0)}</td>
                <td className="px-3 py-2 text-right text-green-600">+{data?.users.newThisMonth ?? 0}</td>
              </tr>
              <tr>
                <td className="px-3 py-2 text-slate-800">Completed Appointments</td>
                <td className="px-3 py-2 text-right font-medium">{data?.appointments.completed ?? 0}</td>
                <td className="px-3 py-2 text-right text-slate-500">-</td>
                <td className="px-3 py-2 text-right text-green-600">{data?.appointments.completionRate ?? 0}%</td>
              </tr>
              <tr>
                <td className="px-3 py-2 text-slate-800">This Month Revenue</td>
                <td className="px-3 py-2 text-right font-medium">{formatCurrency(data?.revenue.thisMonth ?? 0)}</td>
                <td className="px-3 py-2 text-right text-slate-500">{formatCurrency(data?.revenue.lastMonth ?? 0)}</td>
                <td className="px-3 py-2 text-right text-green-600">+{data?.revenue.growthRate ?? 0}%</td>
              </tr>
              <tr>
                <td className="px-3 py-2 text-slate-800">Platform Earnings</td>
                <td className="px-3 py-2 text-right font-medium">{formatCurrency(data?.revenue.platformFees ?? 0)}</td>
                <td className="px-3 py-2 text-right text-slate-500">-</td>
                <td className="px-3 py-2 text-right text-slate-500">-</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Link to="/admin/verifications">
          <Card hover className="text-center p-4">
            <FiCheckSquare className="mx-auto text-2xl text-lk-accent mb-1" />
            <div className="font-semibold text-sm">Verify Lawyers</div>
            <Badge variant="warning" className="mt-1 text-xs">{stats?.users?.pendingVerifications ?? 0} pending</Badge>
          </Card>
        </Link>
        <Link to="/admin/users">
          <Card hover className="text-center p-4">
            <FiUsers className="mx-auto text-2xl text-blue-600 mb-1" />
            <div className="font-semibold text-sm">Manage Users</div>
            <p className="text-xs text-slate-500 mt-1">{stats?.users?.total ?? 0} total</p>
          </Card>
        </Link>
        <Link to="/admin/payments">
          <Card hover className="text-center p-4">
            <FiDollarSign className="mx-auto text-2xl text-green-600 mb-1" />
            <div className="font-semibold text-sm">View Payments</div>
            <p className="text-xs text-slate-500 mt-1">Transactions</p>
          </Card>
        </Link>
        <Link to="/admin/reviews">
          <Card hover className="text-center p-4">
            <FiStar className="mx-auto text-2xl text-purple-600 mb-1" />
            <div className="font-semibold text-sm">Manage Reviews</div>
            <p className="text-xs text-slate-500 mt-1">{stats?.reviews ?? 0} reviews</p>
          </Card>
        </Link>
        <Link to="/admin/announcements">
          <Card hover className="text-center p-4">
            <FiBarChart2 className="mx-auto text-2xl text-indigo-600 mb-1" />
            <div className="font-semibold text-sm">Announcements</div>
            <p className="text-xs text-slate-500 mt-1">Broadcast Messages</p>
          </Card>
        </Link>
      </div>
    </div>
  );
}
