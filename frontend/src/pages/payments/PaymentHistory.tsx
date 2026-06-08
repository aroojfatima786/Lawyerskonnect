import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FiCreditCard, FiDollarSign, FiCalendar, FiClock, FiDownload } from 'react-icons/fi';
import { useRole } from '../../context/AuthContext';
import { paymentApi } from '../../services/api';
import { Card, CardHeader, StatusBadge, Badge, Button, PremiumTabs } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';

function paymentCallbackMessage(code: string | null, message: string | null): string {
  if (message && message.length > 0) {
    return message;
  }
  switch (code) {
    case 'PAYMENT_SIGNATURE_INVALID':
      return 'Payment could not be verified (invalid signature). If you were charged, contact support with your reference.';
    case 'PAYMENT_AMOUNT_MISMATCH':
      return 'Payment amount did not match your order. No funds were applied; try again or contact support.';
    case 'PAYMENT_NOT_FOUND':
      return 'We could not match this return to a payment. Use Pay again from My Appointments if needed.';
    case 'PAYMENT_CALLBACK_CONFLICT':
      return 'This payment was already completed with a different reference.';
    case 'PAYMENT_STATUS_TRANSITION':
      return 'This payment can no longer be completed automatically. Start a new payment from checkout if needed.';
    case 'PAYMENT_PROVIDER_NOT_CONFIGURED':
      return 'Payment gateway is not configured on the server. For demos use PAYMENT_PROVIDER=manual, or complete JazzCash/EasyPaisa variables in backend .env.';
    default:
      return 'Something went wrong after the payment page. Check payment history or try again from My Appointments.';
  }
}

type CitizenPaymentFilter = 'all' | 'completed' | 'pending' | 'failed' | 'refunded';

function citizenPaymentBucket(status: string): Exclude<CitizenPaymentFilter, 'all'> {
  const st = String(status || '').toLowerCase();
  if (['completed', 'paid', 'success'].includes(st)) return 'completed';
  if (['failed', 'declined'].includes(st)) return 'failed';
  if (st.includes('refund')) return 'refunded';
  return 'pending';
}

export default function PaymentHistory() {
  const { isLawyer } = useRole();
  const [searchParams, setSearchParams] = useSearchParams();
  const toast = useToast();
  const [payments, setPayments] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [citizenPayFilter, setCitizenPayFilter] = useState<CitizenPaymentFilter>('all');
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  useEffect(() => {
    const result = searchParams.get('paymentResult');
    const code = searchParams.get('code');
    const msg = searchParams.get('message');
    if (result) {
      if (result === 'error') {
        toast.error(paymentCallbackMessage(code, msg));
      } else if (result === 'completed') {
        toast.success('Payment completed. Use the "Download invoice" button in this list.');
      } else if (result === 'failed') {
        toast.error('Payment was not successful. You can start again from the appointment checkout.');
      } else if (result === 'pending') {
        toast.info('Payment is still processing. Refresh this page in a few moments.');
      }
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams, toast]);

  useEffect(() => {
    loadPayments();
  }, []);

  const loadPayments = async () => {
    try {
      const response: any = await paymentApi.getHistory(1, 50);
      setPayments(response.data || []);
      setSummary(response.summary || {});
    } catch (error) {
      console.error('Failed to load payments:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredPayments = useMemo(() => {
    if (isLawyer || citizenPayFilter === 'all') return payments;
    return payments.filter((p) => citizenPaymentBucket(p?.status) === citizenPayFilter);
  }, [payments, citizenPayFilter, isLawyer]);

  const completedTotals = useMemo(() => {
    const ok = (p: any) => ['completed', 'paid', 'success'].includes(String(p?.status || '').toLowerCase());
    const list = payments.filter(ok);
    const sum = list.reduce(
      (acc, p) => acc + (isLawyer ? Number(p.lawyerAmount ?? p.amount ?? 0) : Number(p.amount ?? 0)),
      0,
    );
    return { count: list.length, sum };
  }, [payments, isLawyer]);

  const avgPerCompleted =
    completedTotals.count > 0 ? Math.round(completedTotals.sum / completedTotals.count) : 0;

  const paymentStats = useMemo(() => {
    const st = (p: any) => String(p?.status || '').toLowerCase();
    let pending = 0;
    let completed = 0;
    let failed = 0;
    payments.forEach((p) => {
      if (['completed', 'paid', 'success'].includes(st(p))) completed += 1;
      else if (['failed', 'declined'].includes(st(p))) failed += 1;
      else if (['pending', 'processing', 'awaiting'].includes(st(p))) pending += 1;
    });
    return { pending, completed, failed };
  }, [payments]);

  const getMethodLabel = (payment: any) => {
    if (payment?.stripeSessionId || payment?.gatewayResponse?.stripe) {
      return 'Stripe (Card)';
    }
    const method = typeof payment === 'string' ? payment : payment?.method;
    const labels: Record<string, string> = {
      jazzcash: 'JazzCash',
      easypaisa: 'EasyPaisa',
      card: 'Card',
      bank_transfer: 'Bank Transfer',
    };
    return labels[method] || method;
  };

  const isStripePayment = (payment: any) =>
    Boolean(payment?.stripeSessionId || payment?.gatewayResponse?.stripe);

  const canCitizenConfirmPending = (payment: any) =>
    !isLawyer &&
    citizenPaymentBucket(payment?.status) === 'pending' &&
    String(payment?.provider || 'manual') === 'manual' &&
    !isStripePayment(payment);

  const canSyncStripePending = (payment: any) =>
    !isLawyer && citizenPaymentBucket(payment?.status) === 'pending' && isStripePayment(payment);

  const pendingManualCount = useMemo(
    () => (!isLawyer ? payments.filter(canCitizenConfirmPending).length : 0),
    [payments, isLawyer],
  );

  const pendingStripeCount = useMemo(
    () => (!isLawyer ? payments.filter(canSyncStripePending).length : 0),
    [payments, isLawyer],
  );

  const canDownloadInvoice = (payment: any) =>
    ['completed', 'paid', 'success', 'refunded'].includes(String(payment?.status || '').toLowerCase());

  const paymentRecordId = (payment: any) => {
    const raw = payment?._id ?? payment?.id;
    if (raw == null) return '';
    if (typeof raw === 'string') return raw.trim();
    if (typeof raw === 'object') {
      if (typeof raw.$oid === 'string') return raw.$oid;
      if (raw._id != null) return String(raw._id);
      if (typeof raw.toString === 'function') {
        const s = raw.toString();
        if (/^[a-f0-9]{24}$/i.test(s)) return s;
      }
    }
    return String(raw);
  };

  const handleDownloadInvoice = async (payment: any) => {
    const id = paymentRecordId(payment);
    if (!id) {
      toast.error('Invalid payment reference');
      return;
    }
    try {
      await paymentApi.downloadInvoice(id);
      toast.success('Invoice downloaded');
    } catch (error: any) {
      toast.error(error?.message || 'Could not download invoice');
    }
  };

  const handleConfirmPending = async (payment: any) => {
    const id = paymentRecordId(payment);
    if (!id) {
      toast.error('Invalid payment reference');
      return;
    }
    setConfirmingId(id);
    try {
      await paymentApi.confirm(id);
      toast.success('Payment confirmed. You can download your invoice now.');
      await loadPayments();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Could not confirm payment');
    } finally {
      setConfirmingId(null);
    }
  };

  const handleSyncStripe = async (payment: any) => {
    const id = paymentRecordId(payment);
    const appointmentId =
      typeof payment?.appointmentId === 'string'
        ? payment.appointmentId
        : payment?.appointmentId?._id || payment?.appointmentId?.id;
    setConfirmingId(id);
    try {
      const sync: any = await paymentApi.syncStripeConsultation({
        paymentId: id || undefined,
        appointmentId: appointmentId ? String(appointmentId) : undefined,
      });
      if (sync?.completed) {
        toast.success('Stripe payment verified. Invoice is ready.');
      } else {
        toast.info('Stripe has not marked this session paid yet. Try again in a moment.');
      }
      await loadPayments();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Could not verify Stripe payment');
    } finally {
      setConfirmingId(null);
    }
  };

  return (
    <div className="space-y-5 overflow-x-hidden lg:space-y-6">
      <div className="lk-portal-page-head">
        {!isLawyer && payments.length > 0 && (
          <PremiumTabs
            tabs={[
              { id: 'all', label: 'All' },
              { id: 'completed', label: 'Completed' },
              { id: 'pending', label: 'Pending' },
              { id: 'refunded', label: 'Refunded' },
              { id: 'failed', label: 'Failed' },
            ]}
            active={citizenPayFilter}
            onChange={setCitizenPayFilter}
            size="sm"
          />
        )}
      </div>

      <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${isLawyer ? 'xl:grid-cols-3' : 'xl:grid-cols-4'}`}>
        <Card className="lk-portal-card flex min-h-[104px] items-center gap-4 rounded-2xl border-slate-200/90 shadow-lk-card-md ring-1 ring-slate-100/70">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-50">
            <FiDollarSign className="text-xl text-lk-success" />
          </div>
          <div className="min-w-0">
            <div className="text-2xl font-bold tabular-nums text-lk-navy">
              PKR {(isLawyer ? summary.totalEarnings : summary.totalAmount || 0).toLocaleString()}
            </div>
            <div className="text-sm text-lk-muted">{isLawyer ? 'Total earnings' : 'Total spent'}</div>
            {!isLawyer ? <p className="mt-0.5 text-xs text-lk-muted/90">Total paid through consultations</p> : null}
          </div>
        </Card>

        <Card className="lk-portal-card flex min-h-[104px] items-center gap-4 rounded-2xl border-slate-200/90 shadow-lk-card-md ring-1 ring-slate-100/70">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50">
            <FiCreditCard className="text-xl text-lk-accent" />
          </div>
          <div>
            <div className="text-2xl font-bold tabular-nums text-lk-navy">{summary.count || 0}</div>
            <div className="text-sm text-lk-muted">Transactions</div>
          </div>
        </Card>

        {!isLawyer ? (
          <Card className="lk-portal-card flex min-h-[104px] items-center gap-4 rounded-2xl border-slate-200/90 shadow-lk-card-md ring-1 ring-slate-100/70">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-50">
              <FiClock className="text-xl text-lk-warning" />
            </div>
            <div>
              <div className="text-2xl font-bold tabular-nums text-lk-navy">{paymentStats.pending}</div>
              <div className="text-sm text-lk-muted">Pending / processing</div>
            </div>
          </Card>
        ) : null}

        <Card className="lk-portal-card flex min-h-[104px] items-center gap-4 rounded-2xl border-slate-200/90 shadow-lk-card-md ring-1 ring-slate-100/70 sm:col-span-2 xl:col-span-1">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-100">
            <FiCalendar className="text-xl text-lk-navy" />
          </div>
          <div className="min-w-0">
            <div className="text-2xl font-bold tabular-nums text-lk-navy">PKR {avgPerCompleted.toLocaleString()}</div>
            <div className="text-sm text-lk-muted">Avg. per transaction (completed)</div>
          </div>
        </Card>
      </div>

      {!isLawyer && pendingStripeCount > 0 ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950">
          <p className="font-semibold">Paid with Stripe but still pending?</p>
          <p className="mt-1 leading-relaxed text-blue-900/90">
            After Stripe test checkout, tap <strong>Verify Stripe</strong> below. Local dev often misses the
            webhook — this checks your session directly with Stripe.
          </p>
        </div>
      ) : null}

      {!isLawyer && pendingManualCount > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-semibold">Payment sent but still pending?</p>
          <p className="mt-1 leading-relaxed text-amber-900/90">
            In demo/manual mode, JazzCash or bank transfer completes only after you tap{' '}
            <strong>I&apos;ve paid</strong> below (same as &quot;I&apos;ve Paid — Confirm&quot; on checkout).
          </p>
        </div>
      ) : null}

      <Card className="lk-portal-card overflow-hidden rounded-2xl border-slate-200/90 shadow-lk-card-lg ring-1 ring-slate-100/80">
        <CardHeader
          title="Transactions"
          subtitle={
            payments.length
              ? isLawyer
                ? `${payments.length} shown`
                : `${filteredPayments.length} of ${payments.length} shown`
              : undefined
          }
        />
        
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-4 animate-pulse">
                <div className="h-10 w-10 rounded-lg bg-slate-200" />
                <div className="flex-1">
                  <div className="h-4 bg-slate-200 rounded w-1/3 mb-2" />
                  <div className="h-3 bg-slate-200 rounded w-1/4" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredPayments.length === 0 && payments.length > 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm font-medium text-lk-navy">No transactions in this category</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => setCitizenPayFilter('all')}>
              Show all
            </Button>
          </div>
        ) : payments.length === 0 ? (
          <div className="py-12 text-center">
            <FiCreditCard className="mx-auto mb-4 text-5xl text-lk-border" />
            <h3 className="mb-2 text-lg font-semibold text-lk-navy">No payments yet</h3>
            <p className="text-sm text-lk-muted">Payments you complete from appointments will appear here.</p>
            {!isLawyer && (
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <Link to="/client/appointments">
                  <Button variant="outline" size="sm">
                    View appointments
                  </Button>
                </Link>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto rounded-xl border border-slate-200/90 lg:block">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-slate-200/90 bg-gradient-to-r from-slate-50 to-blue-50/30">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-lk-muted">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-lk-muted">{isLawyer ? 'Client' : 'Lawyer'}</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-lk-muted">Method</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-lk-muted">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-lk-muted">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-lk-muted">Reference</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-lk-muted">Invoice</th>
                </tr>
              </thead>
              <tbody>
                {filteredPayments.map((payment) => {
                  const otherPerson = isLawyer ? payment.citizenId : payment.lawyerId;
                  const profile = isLawyer
                    ? otherPerson?.citizenProfile
                    : otherPerson?.lawyerProfile;

                  return (
                    <tr key={payment._id} className="border-b border-slate-100 bg-white last:border-0 transition-colors hover:bg-slate-50/90">
                      <td className="px-4 py-3 align-top">
                        <div className="font-medium text-lk-navy">{new Date(payment.createdAt).toLocaleDateString()}</div>
                        <div className="text-xs text-lk-muted">{new Date(payment.createdAt).toLocaleTimeString()}</div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="font-medium text-lk-navy">{profile?.fullName || 'User'}</div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <Badge variant="secondary" size="sm">
                          {getMethodLabel(payment)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="font-semibold tabular-nums text-lk-navy">PKR {(isLawyer ? payment.lawyerAmount : payment.amount).toLocaleString()}</div>
                        {isLawyer && <div className="text-xs text-lk-muted">Platform fee PKR {payment.platformFeeAmount}</div>}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <StatusBadge status={payment.status} />
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="font-mono text-xs text-lk-muted">{payment.referenceNumber}</div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        {canDownloadInvoice(payment) ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void handleDownloadInvoice(payment)}
                            leftIcon={<FiDownload />}
                          >
                            Download
                          </Button>
                        ) : canSyncStripePending(payment) ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void handleSyncStripe(payment)}
                            isLoading={confirmingId === paymentRecordId(payment)}
                          >
                            Verify Stripe
                          </Button>
                        ) : canCitizenConfirmPending(payment) ? (
                          <Button
                            size="sm"
                            onClick={() => void handleConfirmPending(payment)}
                            isLoading={confirmingId === paymentRecordId(payment)}
                          >
                            I&apos;ve paid
                          </Button>
                        ) : citizenPaymentBucket(payment?.status) === 'pending' ? (
                          <span className="text-xs text-lk-muted">Processing…</span>
                        ) : (
                          <span className="text-xs text-lk-muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
            <div className="space-y-3 lg:hidden">
              {filteredPayments.map((payment) => {
                const otherPerson = isLawyer ? payment.citizenId : payment.lawyerId;
                const profile = isLawyer ? otherPerson?.citizenProfile : otherPerson?.lawyerProfile;
                return (
                  <div key={payment._id} className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-lk-card-md ring-1 ring-slate-100/60">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-lk-navy">{profile?.fullName || 'User'}</p>
                        <p className="text-xs text-lk-muted">{new Date(payment.createdAt).toLocaleString()}</p>
                      </div>
                      <StatusBadge status={payment.status} />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                      <Badge variant="secondary" size="sm">
                        {getMethodLabel(payment)}
                      </Badge>
                      <span className="font-bold tabular-nums text-lk-navy">
                        PKR {(isLawyer ? payment.lawyerAmount : payment.amount).toLocaleString()}
                      </span>
                    </div>
                    {payment.referenceNumber ? (
                      <p className="mt-2 font-mono text-xs text-lk-muted">{payment.referenceNumber}</p>
                    ) : null}
                    {canDownloadInvoice(payment) ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-3 w-full"
                        onClick={() => void handleDownloadInvoice(payment)}
                        leftIcon={<FiDownload />}
                      >
                        Download invoice
                      </Button>
                    ) : canSyncStripePending(payment) ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-3 w-full"
                        onClick={() => void handleSyncStripe(payment)}
                        isLoading={confirmingId === paymentRecordId(payment)}
                      >
                        Verify Stripe payment
                      </Button>
                    ) : canCitizenConfirmPending(payment) ? (
                      <Button
                        size="sm"
                        className="mt-3 w-full"
                        onClick={() => void handleConfirmPending(payment)}
                        isLoading={confirmingId === paymentRecordId(payment)}
                      >
                        I&apos;ve paid — confirm
                      </Button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
