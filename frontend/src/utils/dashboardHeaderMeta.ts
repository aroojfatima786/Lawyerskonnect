/** Longest-prefix match: list more specific paths first */
const ROUTES: Array<{ prefix: string; title: string; subtitle?: string; backTo?: string }> = [
  { prefix: '/notifications', title: 'Notifications', subtitle: 'Updates and alerts' },
  {
    prefix: '/client/payments/checkout',
    title: 'Secure Consultation Payment',
    subtitle: 'Escrow held by LawyersKonnect until consultation rules are met.',
    backTo: '/client/appointments',
  },
  { prefix: '/client/payments', title: 'Payments', subtitle: 'Receipts, references, and transaction status.' },
  {
    prefix: '/client/appointments/book',
    title: 'Book appointment',
    subtitle: 'Choose a time with your lawyer.',
    backTo: '/client/appointments',
  },
  { prefix: '/client/appointments', title: 'My appointments', subtitle: 'Track requests, confirmations, payments, and consultation access.' },
  { prefix: '/client/messages', title: 'Messages', subtitle: 'Secure consultation chat with your counsel.' },
  { prefix: '/client/reviews', title: 'My reviews', subtitle: 'Feedback you have shared with lawyers.' },
  { prefix: '/client/profile', title: 'Profile settings', subtitle: 'Personal details, security, and preferences.' },
  { prefix: '/client/legal-guidance', title: 'AI Legal Guidance', subtitle: 'Describe your issue or upload a case document for references and verified lawyer suggestions.' },
  { prefix: '/client/find-lawyer', title: 'Find lawyers', subtitle: 'Search verified counsel and book consultations.' },
  { prefix: '/client/lawyers', title: 'Lawyer profile', subtitle: 'Credentials, fees, and booking.', backTo: '/client/find-lawyer' },
  { prefix: '/client/support', title: 'Help & support', subtitle: 'Get assistance using the platform.' },
  { prefix: '/client/notifications', title: 'Notifications', subtitle: 'Appointments, payments, messages, and system updates.' },
  { prefix: '/client/dashboard', title: 'Dashboard', subtitle: 'Your consultations, payments, and messages in one place.' },

  { prefix: '/lawyer/availability', title: 'Availability', subtitle: 'Consultation slots', backTo: '/lawyer/dashboard' },
  { prefix: '/lawyer/appointments', title: 'Appointments', subtitle: 'Client bookings' },
  { prefix: '/lawyer/subscription', title: 'Subscription', subtitle: 'Plans and billing' },
  { prefix: '/lawyer/earnings', title: 'Earnings', subtitle: 'Payouts and escrow' },
  { prefix: '/lawyer/messages', title: 'Messages', subtitle: 'Client conversations' },
  { prefix: '/lawyer/reviews', title: 'Reviews', subtitle: 'Client feedback' },
  { prefix: '/lawyer/profile', title: 'Profile & settings', subtitle: 'Practice details' },
  { prefix: '/lawyer/support', title: 'Help & support', subtitle: 'Get assistance' },
  { prefix: '/lawyer/notifications', title: 'Notifications', subtitle: 'Updates and alerts' },
  { prefix: '/lawyer/dashboard', title: 'Dashboard', subtitle: 'Confirmations, client messages, and upcoming consultations in one place.' },

  { prefix: '/admin/legal-knowledge', title: 'Legal knowledge', subtitle: 'Knowledge base' },
  { prefix: '/admin/chat-violations', title: 'Chat violations', subtitle: 'Policy enforcement' },
  { prefix: '/admin/announcements', title: 'Announcements', subtitle: 'Broadcast updates' },
  { prefix: '/admin/categories', title: 'Categories', subtitle: 'Practice areas' },
  { prefix: '/admin/verifications', title: 'Verifications', subtitle: 'Lawyer onboarding' },
  { prefix: '/admin/complaints', title: 'Complaints', subtitle: 'User reports' },
  { prefix: '/admin/reviews', title: 'Reviews moderation', subtitle: 'Quality oversight' },
  { prefix: '/admin/payments', title: 'Payments & payouts', subtitle: 'Escrow and releases' },
  { prefix: '/admin/users', title: 'Users', subtitle: 'Accounts directory' },
  { prefix: '/admin/reports', title: 'Reports', subtitle: 'Analytics and exports' },
  { prefix: '/admin', title: 'Admin dashboard', subtitle: 'Platform overview' },
];

export function getDashboardHeaderMeta(pathname: string): { title: string; subtitle?: string; backTo?: string } {
  const hit = ROUTES.find((r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`));
  return hit ? { title: hit.title, subtitle: hit.subtitle, backTo: hit.backTo } : { title: 'Dashboard' };
}
