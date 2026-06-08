import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FiSmartphone, FiCheck, FiShield, FiLock, FiCalendar, FiClock, FiUser } from 'react-icons/fi';
import { appointmentApi, paymentApi } from '../../services/api';
import { Card, CardHeader, Button, Input } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../context/AuthContext';

import { WALLET_PAYMENT_METHODS } from '../../constants/paymentMethods';
import { isStripeEnabled } from '../../config/stripe';
import { computeConsultationFeeBreakdown } from '../../utils/consultationFee';

type CheckoutUiContext = {
  paymentProvider: string;
  providerDisplayLabel: string;
  isDemoManualMode: boolean;
  demoManualNotice?: string;
  manualModeExplanation?: string;
  jazzcashSandbox: boolean;
  easypaisaSandbox: boolean;
  jazzcashConfigured: boolean;
  easypaisaConfigured: boolean;
  allowedMethodIds: string[];
  cardUiMode: 'hidden' | 'demo_manual_instructions' | 'unavailable';
  checkoutBlocked: boolean;
  checkoutBlockedReason?: string;
  gatewayConfigWarnings: string[];
};

function friendlyInitiateError(error: any): string {
  const code = error?.code as string | undefined;
  const raw = String(error?.message || '');
  if (code === 'PAYMENT_PROVIDER_NOT_CONFIGURED') {
    if (raw.toLowerCase().includes('jazzcash')) {
      return 'JazzCash is not fully configured. Add merchant variables from backend .env.example, or switch PAYMENT_PROVIDER=manual for demo mode.';
    }
    if (raw.toLowerCase().includes('easypaisa')) {
      return 'EasyPaisa is not fully configured. Add merchant variables from .env.example, or use manual demo mode.';
    }
    if (raw.toLowerCase().includes('card')) {
      return 'Card checkout is not available in this build. Use Manual / Demo mode or configure JazzCash or EasyPaisa.';
    }
    return raw || 'Payment gateway is not configured. Contact support or use Manual / Demo mode if enabled.';
  }
  if (raw.includes('does not match configured provider')) {
    return 'This payment option does not match the gateway selected on the server. Refresh the page or choose the method highlighted for your environment.';
  }
  if (raw.includes('already in progress')) {
    return 'A payment for this appointment is already in progress. Complete it or cancel from payment history.';
  }
  return raw || 'Could not start payment. Please try again.';
}

export default function Checkout() {
  const { appointmentId } = useParams<{ appointmentId: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();

  const [appointment, setAppointment] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMethod, setSelectedMethod] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [processing, setProcessing] = useState(false);
  const [paymentInitiated, setPaymentInitiated] = useState(false);
  const [paymentId, setPaymentId] = useState('');
  const [gatewayInfo, setGatewayInfo] = useState<any>(null);
  const [providerName, setProviderName] = useState<'manual' | 'jazzcash' | 'easypaisa' | 'card' | ''>('');
  const [checkoutUrl, setCheckoutUrl] = useState('');
  const [redirectFormPayload, setRedirectFormPayload] = useState<any>(null);
  const [feeBreakdown, setFeeBreakdown] = useState<{
    consultationFee?: number;
    platformFee: number;
    platformFeePercent?: number;
    totalPayable: number;
  } | null>(null);
  const [referenceNumber, setReferenceNumber] = useState('');
  const [checkoutUi, setCheckoutUi] = useState<CheckoutUiContext | null>(null);
  const stripeCheckoutEnabled = isStripeEnabled();

  useEffect(() => {
    loadAppointment();
  }, [appointmentId]);

  const loadCheckoutUi = async () => {
    try {
      const r: any = await paymentApi.getCitizenCheckoutContext();
      const d = r?.data as CheckoutUiContext | undefined;
      setCheckoutUi(d || null);
    } catch {
      setCheckoutUi(null);
    }
  };

  useEffect(() => {
    void loadCheckoutUi();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const stripeResult = params.get('stripe');
    if (stripeResult !== 'success' && stripeResult !== 'cancel') return;

    const run = async () => {
      if (stripeResult === 'success') {
        const apptId = (appointmentId || '').trim();
        try {
          const sync: any = await paymentApi.syncStripeConsultation(
            apptId.length === 24 ? { appointmentId: apptId } : {},
          );
          if (sync?.completed) {
            toast.success('Stripe payment confirmed. Invoice is ready on Payments.');
          } else {
            toast.info('Stripe payment received. If status stays pending, tap Verify on the Payments page.');
          }
        } catch {
          toast.info('Stripe payment received. Open Payments and tap Verify if it still shows pending.');
        }
        navigate('/client/payments', { replace: true });
      } else {
        toast.info('Stripe checkout was cancelled. You can try again or use another payment method.');
      }
    };

    void run();
  }, [appointmentId, navigate, toast]);

  useEffect(() => {
    if (selectedMethod && !WALLET_PAYMENT_METHODS.some((m) => m.id === selectedMethod)) {
      setSelectedMethod('');
    }
  }, [selectedMethod]);

  useEffect(() => {
    const savedMethod = String(user?.paymentInfo?.methodType || '').toLowerCase();
    const savedIdentifier = String(user?.paymentInfo?.accountIdentifier || '').trim();
    if (!savedMethod) return;
    if (!['jazzcash', 'easypaisa'].includes(savedMethod)) return;
    if (checkoutUi?.checkoutBlocked) return;
    if (selectedMethod) return;

    setSelectedMethod(savedMethod);
    if (!phoneNumber && savedIdentifier) {
      setPhoneNumber(savedIdentifier);
    }
  }, [user?.paymentInfo?.methodType, user?.paymentInfo?.accountIdentifier, checkoutUi?.checkoutBlocked, selectedMethod, phoneNumber]);

  useEffect(() => {
    const savedMethod = String(user?.paymentInfo?.methodType || '').toLowerCase();
    const savedIdentifier = String(user?.paymentInfo?.accountIdentifier || '').trim();
    if (!selectedMethod) return;
    if (selectedMethod === savedMethod && savedIdentifier) {
      setPhoneNumber(savedIdentifier);
      return;
    }
    // Do not auto-carry saved number to the other payment method.
    setPhoneNumber('');
  }, [selectedMethod, user?.paymentInfo?.methodType, user?.paymentInfo?.accountIdentifier]);

  const loadAppointment = async () => {
    const id = (appointmentId || '').trim();
    if (id.length !== 24) {
      toast.error('Invalid appointment link. Redirecting to your appointments.');
      navigate('/client/appointments', { replace: true });
      setLoading(false);
      return;
    }
    try {
      const response: any = await appointmentApi.getById(id);
      setAppointment(response.data);

      if (response.data?.isPaid) {
        toast.info('This appointment is already paid');
        navigate('/client/appointments');
        return;
      }
      if (response.data?.status !== 'confirmed') {
        toast.info('Payment is only available after the lawyer confirms your appointment.');
        navigate('/client/appointments', { replace: true });
        return;
      }
    } catch (error: any) {
      console.error('Failed to load appointment:', error);
      toast.error('Appointment not found or link invalid. Redirecting to your appointments.');
      navigate('/client/appointments', { replace: true });
    } finally {
      setLoading(false);
    }
  };

  const handleInitiatePayment = async () => {
    if (!selectedMethod) {
      toast.error('Please select a payment method');
      return;
    }

    if (
      !stripeCheckoutEnabled &&
      ['jazzcash', 'easypaisa'].includes(selectedMethod) &&
      !phoneNumber.trim()
    ) {
      toast.error('Please enter your wallet mobile number');
      return;
    }

    if (stripeCheckoutEnabled) {
      await handleStripePayment();
      return;
    }

    setProcessing(true);
    try {
      const idToUse = appointment?._id ?? appointment?.id ?? appointmentId;
      const idStr = idToUse != null ? String(idToUse) : '';
      if (!idStr || idStr.length !== 24) {
        toast.error('Invalid appointment. Please go back to My Appointments and try Pay Now again.');
        setProcessing(false);
        return;
      }
      const response: any = await paymentApi.initiate(
        idStr,
        selectedMethod,
        phoneNumber || undefined
      );

      setPaymentId(response.data?.paymentId ?? response.data?._id);
      setProviderName(response.data?.provider || '');
      setGatewayInfo(response.data?.gatewayInfo);
      setCheckoutUrl(response.data?.checkoutUrl || '');
      setRedirectFormPayload(response.data?.redirectFormPayload || null);
      setFeeBreakdown(response.data?.feeBreakdown || null);
      setReferenceNumber(response.data?.referenceNumber || '');
      setPaymentInitiated(true);
      toast.success('Payment initiated! Please complete the payment.');
    } catch (error: any) {
      toast.error(friendlyInitiateError(error));
    } finally {
      setProcessing(false);
    }
  };

  const handleStripePayment = async () => {
    const idToUse = appointment?._id ?? appointment?.id ?? appointmentId;
    const idStr = idToUse != null ? String(idToUse) : '';
    const userId = user?._id;
    if (!idStr || idStr.length !== 24) {
      toast.error('Invalid appointment. Please go back to My Appointments and try Pay Now again.');
      return;
    }
    if (!userId) {
      toast.error('Please sign in again to continue with checkout.');
      return;
    }
    if (!selectedMethod || !['jazzcash', 'easypaisa'].includes(selectedMethod)) {
      toast.error('Please select JazzCash or EasyPaisa');
      return;
    }

    setProcessing(true);
    try {
      const payable = computeConsultationFeeBreakdown(Number(appointment?.fee || 0));
      const response: any = await paymentApi.createStripeSession({
        amount: payable.totalPayable,
        currency: 'PKR',
        orderId: idStr,
        userId: String(userId),
        walletMethod: selectedMethod as 'jazzcash' | 'easypaisa',
      });
      const sessionUrl = response?.data?.sessionUrl || response?.sessionUrl;
      if (!sessionUrl) {
        throw new Error('Checkout session URL was not returned');
      }
      window.location.href = sessionUrl;
    } catch (error: any) {
      toast.error(error?.message || 'Could not start checkout. Please try again.');
      setProcessing(false);
    }
  };

  const submitGatewayForm = () => {
    if (!redirectFormPayload?.action || !redirectFormPayload?.fields) return;
    const form = document.createElement('form');
    form.method = redirectFormPayload?.method || 'POST';
    form.action = redirectFormPayload.action;
    form.style.display = 'none';
    Object.entries(redirectFormPayload.fields).forEach(([key, value]) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = key;
      input.value = String(value ?? '');
      form.appendChild(input);
    });
    document.body.appendChild(form);
    form.submit();
    document.body.removeChild(form);
  };

  const handleConfirmPayment = async () => {
    setProcessing(true);
    try {
      await paymentApi.confirm(paymentId);
      toast.success('Payment confirmed. You can download your invoice from the Payments page.');
      navigate('/client/payments');
    } catch (error: any) {
      const msg =
        error.response?.data?.message || friendlyInitiateError(error) || 'Failed to confirm payment';
      if (msg === 'Payment declined') {
        toast.error('Payment declined. Please try another method or card.');
      } else if (msg === 'Payment service unavailable, try again') {
        toast.error('Payment service unavailable. Try again in a moment.');
      } else {
        toast.error(msg);
      }
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-lk-accent border-t-transparent" />
      </div>
    );
  }

  if (!appointment) {
    return (
      <div className="py-12 text-center">
        <h2 className="text-xl font-semibold text-lk-navy">Appointment not found</h2>
        <Button onClick={() => navigate('/client/appointments')} className="mt-4">
          Back to appointments
        </Button>
      </div>
    );
  }

  const lawyerProfile = (appointment.lawyerId as any)?.lawyerProfile;
  const isManualProvider = providerName === 'manual' || (!providerName && !checkoutUrl && !redirectFormPayload);
  const isGatewayRedirect = Boolean(checkoutUrl || redirectFormPayload?.action);
  const hasManualStyleInstructions = Boolean(
    gatewayInfo?.gateway || gatewayInfo?.instructions,
  );

  const visiblePaymentMethods = checkoutUi?.checkoutBlocked ? [] : [...WALLET_PAYMENT_METHODS];
  const consultationFee = Number(appointment?.fee || 0);
  const previewFees =
    feeBreakdown ||
    computeConsultationFeeBreakdown(consultationFee);
  const totalPayable = previewFees.totalPayable;
  const lawyerInitials =
    (lawyerProfile?.fullName || 'L')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p: string) => p[0]?.toUpperCase())
      .join('') || 'L';

  return (
    <div className="w-full space-y-5 pb-8">
      {checkoutUi?.checkoutBlocked ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-950">
          <p className="font-semibold">Checkout not available</p>
          <p className="mt-1 leading-relaxed">{checkoutUi.checkoutBlockedReason}</p>
        </div>
      ) : null}

      {!paymentInitiated ? (
        <>
          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_10px_40px_-16px_rgba(15,23,42,0.14)] ring-1 ring-slate-100/90">
            <div className="flex items-center gap-3 bg-gradient-to-r from-[#0f2746] via-[#12355B] to-[#1a4570] px-5 py-4 text-white">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20">
                <FiShield className="text-lg" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/60">Escrow protected</p>
                <p className="text-sm font-medium text-white/95">Your payment is held safely until the consultation completes</p>
              </div>
            </div>
            <ol className="grid divide-y divide-slate-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              {[
                { step: '1', label: 'Pay', detail: 'JazzCash or EasyPaisa' },
                { step: '2', label: 'Hold', detail: 'LawyersKonnect escrow' },
                { step: '3', label: 'Release', detail: 'After consultation' },
              ].map((item) => (
                <li key={item.step} className="flex items-center gap-3 px-5 py-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#12355B]/10 text-xs font-bold text-[#12355B] ring-1 ring-[#12355B]/15">
                    {item.step}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-wide text-lk-navy">{item.label}</p>
                    <p className="text-[11px] leading-snug text-lk-muted">{item.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="grid gap-5 lg:grid-cols-2 lg:items-start xl:gap-6">
            <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_10px_40px_-16px_rgba(15,23,42,0.12)] ring-1 ring-slate-100/90">
              <div className="border-b border-slate-100 px-5 py-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-lk-muted">Consultation summary</p>
              </div>
              <div className="space-y-4 px-5 py-5">
                <div className="flex items-center gap-3 rounded-xl bg-slate-50/90 p-3 ring-1 ring-slate-100">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#12355B] to-[#1a4570] text-sm font-bold text-white shadow-md">
                    {lawyerInitials}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-lk-navy">{lawyerProfile?.fullName}</p>
                    <p className="text-[11px] capitalize text-lk-muted">{appointment.consultationType || 'online'} consultation</p>
                  </div>
                </div>

                <ul className="space-y-3 text-sm">
                  <li className="flex items-start justify-between gap-3">
                    <span className="flex items-center gap-2 text-lk-muted">
                      <FiCalendar className="shrink-0 text-slate-400" />
                      Date & time
                    </span>
                    <span className="text-right font-medium text-lk-navy">
                      {new Date(appointment.appointmentDate).toLocaleDateString(undefined, {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                      <span className="block text-xs font-normal text-lk-muted">{appointment.startTime}</span>
                    </span>
                  </li>
                  <li className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 text-lk-muted">
                      <FiClock className="shrink-0 text-slate-400" />
                      Duration
                    </span>
                    <span className="font-medium text-lk-navy">{appointment.duration} min</span>
                  </li>
                  <li className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 text-lk-muted">
                      <FiUser className="shrink-0 text-slate-400" />
                      Type
                    </span>
                    <span className="font-medium capitalize text-lk-navy">{appointment.consultationType || 'online'}</span>
                  </li>
                </ul>

                <div className="space-y-2 rounded-xl border border-slate-100 bg-slate-50/90 px-4 py-3 text-sm">
                  <div className="flex justify-between gap-3">
                    <span className="text-lk-muted">Consultation fee</span>
                    <span className="font-medium tabular-nums text-lk-navy">
                      PKR {(previewFees.consultationFee ?? consultationFee).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-lk-muted">
                      Platform fee ({previewFees.platformFeePercent ?? 10}%)
                    </span>
                    <span className="font-medium tabular-nums text-lk-navy">
                      PKR {previewFees.platformFee.toLocaleString()}
                    </span>
                  </div>
                </div>
                <div className="rounded-xl bg-gradient-to-br from-[#0f2746] to-[#1a4570] px-4 py-4 text-white shadow-inner">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/55">Total payable</p>
                  <p className="mt-1 font-serif text-2xl font-bold tabular-nums tracking-tight">
                    PKR {totalPayable.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_10px_40px_-16px_rgba(15,23,42,0.12)] ring-1 ring-slate-100/90 lg:sticky lg:top-4">
              <div className="border-b border-slate-100 px-5 py-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-lk-muted">Payment method</p>
                <p className="mt-1 text-xs text-lk-muted">Select your mobile wallet to continue</p>
              </div>
              <div className="space-y-4 px-5 py-5">
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {visiblePaymentMethods.map((method) => {
                    const selected = selectedMethod === method.id;
                    return (
                      <button
                        key={method.id}
                        type="button"
                        onClick={() => setSelectedMethod(method.id)}
                        className={`group relative flex flex-col gap-2.5 rounded-xl border p-3 text-left transition-all duration-200 ${
                          selected
                            ? `${method.selectedBg} ${method.selectedBorder} ring-2 ${method.selectedRing} shadow-md`
                            : 'border-slate-200/90 bg-white hover:border-slate-300 hover:shadow-sm'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white ring-1 ring-black/5">
                            <img
                              src={(method as any).iconSrc}
                              alt={method.name}
                              className="h-8 w-8 object-contain"
                            />
                          </div>
                          {selected ? (
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#12355B] text-white">
                              <FiCheck className="text-sm" />
                            </span>
                          ) : (
                            <span className="h-5 w-5 rounded-full border-2 border-slate-200 group-hover:border-slate-300" />
                          )}
                        </div>
                        <div>
                          <p className="font-bold text-lk-navy">{method.name}</p>
                          <p className="mt-0.5 text-[11px] leading-relaxed text-lk-muted">{method.subtitle}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {['jazzcash', 'easypaisa'].includes(selectedMethod) && !stripeCheckoutEnabled && (
                  <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4 ring-1 ring-slate-100/80">
                    <Input
                      label="Wallet mobile number"
                      type="tel"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="03XX-XXXXXXX"
                      leftIcon={<FiSmartphone />}
                      required
                    />
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleInitiatePayment}
                  disabled={!selectedMethod || checkoutUi?.checkoutBlocked || visiblePaymentMethods.length === 0 || processing}
                  className="flex w-full min-h-[52px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#12355B] to-[#1a4570] px-6 py-3.5 text-base font-bold text-white shadow-lg shadow-[#12355B]/25 transition hover:from-[#0f2746] hover:to-[#174066] hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {processing ? (
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  ) : selectedMethod === 'jazzcash' ? (
                    <>Pay with JazzCash · PKR {totalPayable.toLocaleString()}</>
                  ) : selectedMethod === 'easypaisa' ? (
                    <>Pay with EasyPaisa · PKR {totalPayable.toLocaleString()}</>
                  ) : (
                    <>Pay PKR {totalPayable.toLocaleString()}</>
                  )}
                </button>

                <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-lk-muted">
                  <FiLock className="shrink-0" />
                  Encrypted checkout · Funds held in escrow
                </p>
              </div>
            </div>
          </div>
        </>
      ) : (
        /* Payment Instructions */
        <Card>
          <CardHeader title="Complete Your Payment" />
          
          {hasManualStyleInstructions && (
            <div className="mb-6 rounded-xl border border-blue-100 bg-blue-50/80 p-4">
              <h4 className="mb-2 font-semibold text-lk-navy">
                {gatewayInfo?.gateway || 'Payment instructions'}
              </h4>
              <p className="text-slate-600">{gatewayInfo?.instructions}</p>
            </div>
          )}

          {!hasManualStyleInstructions && isGatewayRedirect && (
            <div className="mb-6 rounded-xl border border-blue-100 bg-blue-50/80 p-4">
              <h4 className="mb-2 font-semibold text-lk-navy">Secure checkout</h4>
              <p className="text-slate-600 text-sm">
                {providerName === 'easypaisa' &&
                  'You will be sent to the EasyPaisa hosted page to complete payment. Do not close the window until the gateway finishes.'}
                {providerName === 'jazzcash' &&
                  'You will be sent to JazzCash to complete payment. Chat unlocks only after a verified success from the gateway.'}
                {providerName !== 'easypaisa' &&
                  providerName !== 'jazzcash' &&
                  'You will be redirected to complete payment. Chat unlocks only after verified gateway success.'}
              </p>
            </div>
          )}

          {referenceNumber && (
            <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
              <span className="text-slate-500">Reference:</span>{' '}
              <span className="font-mono font-semibold text-slate-800">{referenceNumber}</span>
            </div>
          )}

          {feeBreakdown && (
            <div className="mb-4 space-y-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
              <div className="flex justify-between">
                <span>Consultation fee</span>
                <span>PKR {(feeBreakdown.consultationFee ?? consultationFee).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Platform fee</span>
                <span>PKR {feeBreakdown.platformFee.toLocaleString()}</span>
              </div>
              <div className="flex justify-between border-t border-slate-100 pt-1 font-semibold">
                <span>Total payable</span>
                <span>PKR {feeBreakdown.totalPayable.toLocaleString()}</span>
              </div>
            </div>
          )}

          {gatewayInfo?.accountToSend && (
            <div className="mb-6">
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Send payment From:
              </label>
              <div className="bg-slate-100 rounded-lg p-4 text-center">
                <span className="font-mono text-xl font-bold text-lk-navy">
                  {gatewayInfo.accountToSend}
                </span>
              </div>
            </div>
          )}

          {isManualProvider ? (
            <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <h5 className="mb-1 font-semibold text-amber-950">Important</h5>
              <p className="text-sm leading-relaxed text-amber-900/90">
                After you send the payment from your bank or wallet, click &quot;I&apos;ve Paid&quot; to confirm. Your
                payment is then verified and the case can proceed; use only after you have actually transferred the funds.
              </p>
              {(gatewayInfo?.receivingWallet || gatewayInfo?.walletDetails) && (
                <div className="mt-3 space-y-1 text-xs text-amber-950">
                  <div>Account Title: {gatewayInfo?.receivingWallet?.accountTitle || gatewayInfo?.walletDetails?.accountTitle || 'LawyersKonnect'}</div>
                  {gatewayInfo?.receivingWallet?.bankName && <div>Bank: {gatewayInfo.receivingWallet.bankName}</div>}
                  {gatewayInfo?.receivingWallet?.accountNumber && <div>Account Number: {gatewayInfo.receivingWallet.accountNumber}</div>}
                  {gatewayInfo?.receivingWallet?.iban && <div>IBAN: {gatewayInfo.receivingWallet.iban}</div>}
                  {gatewayInfo?.receivingWallet?.jazzcashNumber && <div>JazzCash: {gatewayInfo.receivingWallet.jazzcashNumber}</div>}
                  {gatewayInfo?.receivingWallet?.easypaisaNumber && <div>EasyPaisa: {gatewayInfo.receivingWallet.easypaisaNumber}</div>}
                </div>
              )}
            </div>
          ) : (
            <div className="mb-6 rounded-xl border border-lk-border bg-blue-50/90 p-4">
              <h5 className="mb-1 font-semibold text-lk-navy">Gateway verification</h5>
              <p className="text-sm text-lk-muted">
                Use the payment gateway to complete payment. Chat unlocks only after verified gateway success callback.
              </p>
            </div>
          )}

          <div className="flex gap-3">
            {isManualProvider ? (
              <Button
                onClick={handleConfirmPayment}
                className="flex-1"
                size="lg"
                isLoading={processing}
              >
                I've Paid - Confirm Payment
              </Button>
            ) : (
              <Button
                onClick={() => {
                  if (checkoutUrl) {
                    window.location.href = checkoutUrl;
                    return;
                  }
                  submitGatewayForm();
                }}
                className="flex-1"
                size="lg"
              >
                {providerName === 'jazzcash'
                  ? 'Continue to JazzCash'
                  : providerName === 'easypaisa'
                    ? 'Continue to EasyPaisa'
                    : providerName === 'card'
                      ? 'Continue to Card Checkout'
                      : 'Continue to payment gateway'}
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => {
                setPaymentInitiated(false);
                setPaymentId('');
                setGatewayInfo(null);
                setProviderName('');
                setCheckoutUrl('');
                setRedirectFormPayload(null);
              }}
            >
              Change Method
            </Button>
          </div>
        </Card>
      )}

      {/* Security Note */}
      <p className="flex items-center justify-center gap-1.5 text-center text-xs text-lk-muted">
        <FiLock className="shrink-0 opacity-70" />
        Your payment details are processed securely
      </p>
    </div>
  );
}
