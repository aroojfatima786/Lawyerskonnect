/** Placeholder time series with zeros (no random/sample values) when analytics has no data. */
export function buildEmptyMonthlySeries(): Array<{
  month: string;
  users: number;
  appointments: number;
  revenue: number;
}> {
  const now = new Date();
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    return {
      month: d.toLocaleString('en', { month: 'short' }),
      users: 0,
      appointments: 0,
      revenue: 0,
    };
  });
}

export function hasAnalyticsSeries(chartData: {
  userRegistrations?: unknown[];
  appointmentBookings?: unknown[];
  revenueData?: unknown[];
}): boolean {
  return Boolean(
    (chartData.userRegistrations && chartData.userRegistrations.length) ||
      (chartData.appointmentBookings && chartData.appointmentBookings.length) ||
      (chartData.revenueData && chartData.revenueData.length),
  );
}
