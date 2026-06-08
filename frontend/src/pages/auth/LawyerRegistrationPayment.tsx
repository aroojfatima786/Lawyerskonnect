import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { FiAlertCircle, FiCheck, FiCreditCard } from 'react-icons/fi';
import { registrationApi, paymentApi } from '../../services/api';
import { Button, Card } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import { WALLET_PAYMENT_METHODS } from '../../constants/paymentMethods';
import { isStripeEnabled } from '../../config/stripe';

function formatPkr(n: number) {
  return `Rs. ${Number(n || 0).toLocaleString('en-PK')}`;
}

function friendlyError(err: unknown): string {
  const e = err as { message?: string };
  return e?.message || 'Something went wrong. Please try again.';
}

export default function LawyerRegistrationPayment() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const toast = useToast();

  const userId =
    (location.state as { userId?: string })?.userId ||
    searchParams.get('userId') ||
    '';
  const email = (location.state as { email?: string })?.email || searchParams.get('email') || '';

  const stripeHandledRef = useRef(false);
  const redirectHandledRef = useRef(false);

  const goToLogin = () => {
    navigate('/auth/lawyer/login', {
      replace: true,
      state: { email, message: 'Registration fee paid. Sign in to complete your profile.' },
    });
  };

  const [amount, setAmount] = useState(2000);
  const [loading, setLoading] = useState(true);
  const [emailVerified, setEmailVerified] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [processing, setProcessing] = useState(false);
  const [paymentInitiated, setPaymentInitiated] = useState(false);
  const [paymentId, setPaymentId] = useState('');
  const [providerName, setProviderName] = useState('');
  const [gatewayInfo, setGatewayInfo] = useState<any>(null);
  const [referenceNumber, setReferenceNumber] = useState('');
  const [redirectFormPayload, setRedirectFormPayload] = useState<any>(null);
  const [checkoutUrl, setCheckoutUrl] = useState('');
  const [checkoutUi, setCheckoutUi] = useState<any>(null);
  const [alreadyPaid, setAlreadyPaid] = useState(false);

  const stripeCheckoutEnabled = isStripeEnabled();

  const handlePaidRedirect = useCallback(() => {
    if (redirectHandledRef.current) return;
    redirectHandledRef.current = true;
    toast.success('Registration fee paid. Sign in to complete your profile.');
    goToLogin();
  }, [toast, email]);

  const loadStatus = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    try {
      const [feeRes, statusRes] = await Promise.all([
        registrationApi.getFee(),
        registrationApi.getStatus(userId),
      ]);
      const fee = (feeRes as any)?.data?.amount;
      if (fee != null) setAmount(Number(fee));

      const data = (statusRes as any)?.data || {};
      const paid = data.registrationFeePaid === true;
      const verified = data.emailVerified === true;
      setEmailVerified(verified);
      setAlreadyPaid(paid);

      if (!verified) {
        navigate('/auth/verify-email', {
          replace: true,
          state: { userId, email, isLawyer: true },
        });
        return;
      }

      if (paid) {
        handlePaidRedirect();
      }
    } catch {
      /* optional */
    } finally {
      setLoading(false);
    }
  }, [userId, email, navigate, handlePaidRedirect]);

  useEffect(() => {
    if (!userId) {
      navigate('/auth/lawyer/signup', { replace: true });
      return;
    }
    void loadStatus();
  }, [userId, navigate, loadStatus]);

  useEffect(() => {
    paymentApi
      .getCitizenCheckoutContext()
      .then((r: any) => setCheckoutUi(r?.data || null))
      .catch(() => setCheckoutUi(null));
  }, []);

  useEffect(() => {
    const stripeResult = searchParams.get('stripe');
    if (stripeResult !== 'success' || stripeHandledRef.current || !userId) return;

    stripeHandledRef.current = true;
    setSearchParams({}, { replace: true });

    (async () => {
      try {
        await registrationApi.syncStripePayment(userId);

        for (let attempt = 0; attempt < 8; attempt += 1) {
          const statusRes: any = await registrationApi.getStatus(userId);
          if (statusRes?.data?.registrationFeePaid === true) {
            handlePaidRedirect();
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 1200));
        }

        toast.error(
          'Payment received but activation is still processing. Try signing in again in a moment.',
        );
      } catch {
        toast.error('Could not confirm payment. Try signing in — your payment may already be recorded.');
      }
    })();
  }, [searchParams, setSearchParams, toast, handlePaidRedirect, userId]);

  const submitRedirectForm = () => {
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

  const handlePay = async () => {
    if (!emailVerified) {
      toast.error('Please verify your email before paying.');
      navigate('/auth/verify-email', { state: { userId, email, isLawyer: true } });
      return;
    }
    if (!selectedMethod) {
      toast.error('Select a payment method');
      return;
    }
    if (
      !stripeCheckoutEnabled &&
      ['jazzcash', 'easypaisa'].includes(selectedMethod) &&
      !phoneNumber.trim()
    ) {
      toast.error('Enter your mobile number for wallet payment');
      return;
    }

    setProcessing(true);
    try {
      const res: any = await registrationApi.checkout({
        userId,
        method: selectedMethod,
        accountIdentifier: phoneNumber.trim() || undefined,
        stripeCheckout: stripeCheckoutEnabled,
      });
      const d = res?.data || {};

      if (stripeCheckoutEnabled) {
        const stripeRes: any = await registrationApi.createStripeSession({
          userId,
          paymentId: String(d.paymentId || ''),
          amount: Number(d.amount || amount),
          walletMethod: selectedMethod as 'jazzcash' | 'easypaisa',
        });
        const sessionUrl = stripeRes?.sessionUrl || stripeRes?.data?.sessionUrl;
        if (!sessionUrl) throw new Error('Checkout session URL was not returned');
        window.location.href = sessionUrl;
        return;
      }

      setPaymentId(d.paymentId || '');
      setProviderName(d.provider || '');
      setGatewayInfo(d.gatewayInfo);
      setReferenceNumber(d.referenceNumber || '');
      setRedirectFormPayload(d.redirectFormPayload || null);
      setCheckoutUrl(d.checkoutUrl || '');
      setPaymentInitiated(true);
      toast.success('Complete payment using the instructions below.');
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setProcessing(false);
    }
  };

  const handleConfirmManual = async () => {
    if (!paymentId) return;
    setProcessing(true);
    try {
      await registrationApi.confirmPayment(paymentId, userId);
      handlePaidRedirect();
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setProcessing(false);
    }
  };

  const isManualProvider =
    providerName === 'manual' || (!providerName && !checkoutUrl && !redirectFormPayload);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-lk-navy via-slate-900 to-slate-950">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-[#f0a31c] border-t-transparent" />
      </div>
    );
  }

  if (alreadyPaid) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-lk-navy via-slate-900 to-slate-950 px-4 py-10">
      <div className="mx-auto max-w-lg">
        <Link
          to="/auth/lawyer/signup"
          className="mb-4 inline-block text-sm font-medium text-white/80 hover:text-white"
        >
          ← Back to signup
        </Link>

        <Card className="overflow-hidden border-0 shadow-lk-card-lg">
          <div className="bg-lk-navy px-6 py-5 text-white">
            <h1 className="text-2xl font-extrabold">Lawyer registration fee</h1>
            <p className="mt-1 text-sm text-white/80">
              Email verified. Pay {formatPkr(amount)} to activate your account, then sign in and
              complete your profile.
            </p>
            {email && <p className="mt-2 text-xs text-white/60">{email}</p>}
          </div>

          <div className="space-y-5 p-6">
            {stripeCheckoutEnabled && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <FiCreditCard className="mt-0.5 shrink-0" />
                <span>
                  Stripe test mode is on — card checkout simulates JazzCash/EasyPaisa for development.
                </span>
              </div>
            )}

            {checkoutUi?.demoManualNotice && (
              <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                <FiAlertCircle className="mt-0.5 shrink-0" />
                <span>{checkoutUi.demoManualNotice}</span>
              </div>
            )}

            <div>
              <div className="mb-2 text-sm font-semibold text-slate-700">Amount due</div>
              <div className="text-3xl font-extrabold text-lk-navy">{formatPkr(amount)}</div>
            </div>

            {!paymentInitiated && (
              <>
                <div>
                  <div className="mb-3 text-sm font-semibold text-slate-700">Payment method</div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {WALLET_PAYMENT_METHODS.map((m) => {
                      const selected = selectedMethod === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setSelectedMethod(m.id)}
                          className={`flex items-center gap-3 rounded-xl border-2 p-4 text-left transition ${
                            selected
                              ? `${m.selectedBorder} ${m.selectedBg} ring-2 ${m.selectedRing}`
                              : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}
                        >
                          <img src={m.iconSrc} alt="" className="h-10 w-10 object-contain" />
                          <div>
                            <div className="font-bold text-slate-900">{m.name}</div>
                            <div className="text-xs text-slate-500">{m.subtitle}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {['jazzcash', 'easypaisa'].includes(selectedMethod) && !stripeCheckoutEnabled && (
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      Mobile number (wallet)
                    </label>
                    <input
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="03XXXXXXXXX"
                      className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#f0a31c]"
                    />
                  </div>
                )}

                <Button
                  type="button"
                  onClick={() => void handlePay()}
                  disabled={processing || !selectedMethod}
                  className="w-full"
                >
                  {processing ? 'Processing…' : `Pay ${formatPkr(amount)}`}
                </Button>
              </>
            )}

            {paymentInitiated && (
              <div className="space-y-4">
                {referenceNumber && (
                  <p className="text-sm text-slate-600">
                    Reference: <strong className="font-mono">{referenceNumber}</strong>
                  </p>
                )}
                {gatewayInfo?.receivingWallet && (
                  <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
                    <p className="font-semibold">Transfer to platform wallet</p>
                    {gatewayInfo.receivingWallet.jazzcashNumber && (
                      <p>JazzCash: {gatewayInfo.receivingWallet.jazzcashNumber}</p>
                    )}
                    {gatewayInfo.receivingWallet.easypaisaNumber && (
                      <p>EasyPaisa: {gatewayInfo.receivingWallet.easypaisaNumber}</p>
                    )}
                  </div>
                )}
                {checkoutUrl && (
                  <a
                    href={checkoutUrl}
                    className="block w-full rounded-xl bg-lk-navy py-3 text-center font-bold text-white"
                  >
                    Open payment page
                  </a>
                )}
                {redirectFormPayload && (
                  <Button type="button" onClick={submitRedirectForm} className="w-full">
                    Continue to gateway
                  </Button>
                )}
                {isManualProvider && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => void handleConfirmManual()}
                    disabled={processing}
                    className="w-full"
                  >
                    <FiCheck className="mr-2 inline" />
                    I have paid (confirm)
                  </Button>
                )}
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
