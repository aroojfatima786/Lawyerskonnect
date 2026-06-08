import { BadRequestException, Logger } from '@nestjs/common';
import { PaymentProvider, PaymentIntentResult, VerificationResult } from './payment-provider.interface';
import { PaymentDocument, PaymentStatus } from '../../schemas/payment.schema';
import { AppointmentDocument } from '../../schemas/appointment.schema';
import { UserDocument } from '../../schemas/user.schema';
import {
  buildMerchantFormSecureHash,
  selectFieldsForCallbackHash,
  verifyJazzCashSecureHash,
} from '../jazzcash-secure-hash';

type JazzcashEnv = 'sandbox' | 'production';

/** Exposed for HTTP / logging; do not use as success signal alone */
export const JAZZ_ERROR_SIGNATURE_INVALID = 'PAYMENT_SIGNATURE_INVALID';

/**
 * JazzCash payment provider (skeleton + verification).
 *
 * Field names in createPaymentIntent follow the common merchant form shape; the exact
 * set required for your merchant account must match JazzCash integration documentation.
 * Adjust {@link JAZZCALLBACK_HASH_INCLUDE_KEYS} in jazzcash-secure-hash.ts for callback hash
 * if the gateway only signs a response subset.
 */
export class JazzcashPaymentProvider implements PaymentProvider {
  private readonly logger = new Logger(JazzcashPaymentProvider.name);
  private readonly env: JazzcashEnv;
  private readonly merchantId: string;
  private readonly password: string;
  private readonly integritySalt: string;
  private readonly returnUrl: string;
  private readonly webhookUrl: string;

  constructor() {
    this.env = ((process.env.JAZZCASH_ENV || 'sandbox').toLowerCase() === 'production'
      ? 'production'
      : 'sandbox') as JazzcashEnv;
    this.merchantId = (process.env.JAZZCASH_MERCHANT_ID || '').trim();
    this.password = (process.env.JAZZCASH_PASSWORD || '').trim();
    this.integritySalt = (process.env.JAZZCASH_INTEGRITY_SALT || '').trim();
    this.returnUrl = (process.env.JAZZCASH_RETURN_URL || '').trim();
    this.webhookUrl = (process.env.JAZZCASH_WEBHOOK_URL || '').trim();
  }

  getProviderName() {
    return 'jazzcash' as const;
  }

  assertConfigured(): void {
    const missing = [
      ['JAZZCASH_MERCHANT_ID', this.merchantId],
      ['JAZZCASH_PASSWORD', this.password],
      ['JAZZCASH_INTEGRITY_SALT', this.integritySalt],
      ['JAZZCASH_RETURN_URL', this.returnUrl],
      ['JAZZCASH_WEBHOOK_URL', this.webhookUrl],
    ]
      .filter(([, v]) => !v)
      .map(([k]) => k);
    if (missing.length) {
      throw new BadRequestException({
        code: 'PAYMENT_PROVIDER_NOT_CONFIGURED',
        message: `JazzCash provider is not configured. Missing: ${missing.join(', ')}`,
      });
    }
  }

  async createPaymentIntent(
    payment: PaymentDocument,
    appointment: AppointmentDocument,
    user: UserDocument,
    accountIdentifier?: string,
  ): Promise<PaymentIntentResult> {
    this.assertConfigured();

    // Single internal order reference: must be persisted on Payment before this runs (initiate flow).
    const orderRef = String(payment.referenceNumber || '').trim();
    if (!orderRef) {
      throw new BadRequestException('Payment must have a referenceNumber before creating JazzCash intent');
    }

    const timestamp = this.buildTimestamp(new Date());
    const expiry = this.buildTimestamp(new Date(Date.now() + 30 * 60 * 1000));
    // pp_Amount is typically in paisa (min units) for PKR; confirm in merchant PDF.
    const amountInPaisa = Math.round((payment.amount || 0) * 100).toString();

    // pp_TxnRefNo and pp_BillReference both set to our referenceNumber so callbacks can match unambiguously.
    const payload: Record<string, string> = {
      pp_Version: '1.1',
      pp_TxnType: 'MWALLET',
      pp_Language: 'EN',
      pp_MerchantID: this.merchantId,
      pp_SubMerchantID: '',
      pp_Password: this.password,
      pp_BankID: '',
      pp_ProductID: '',
      pp_TxnRefNo: orderRef,
      pp_Amount: amountInPaisa,
      pp_TxnCurrency: 'PKR',
      pp_TxnDateTime: timestamp,
      pp_BillReference: orderRef,
      pp_Description: payment.description || `Consultation fee for appointment ${appointment._id.toString()}`,
      pp_TxnExpiryDateTime: expiry,
      pp_ReturnURL: this.returnUrl,
      pp_SecureHash: '',
      ppmpf_1: payment._id.toString(),
      ppmpf_2: appointment._id.toString(),
      ppmpf_3: user._id.toString(),
      ppmpf_4: accountIdentifier || '',
      ppmpf_5: this.webhookUrl,
    };
    payload.pp_SecureHash = buildMerchantFormSecureHash(this.integritySalt, payload);

    return {
      provider: 'jazzcash',
      providerEnv: this.env,
      providerReference: orderRef,
      redirectFormPayload: {
        method: 'POST',
        action:
          this.env === 'production'
            ? 'https://payments.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/'
            : 'https://sandbox.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/',
        fields: payload,
      },
      providerResponse: {
        environment: this.env,
        pp_TxnRefNo: orderRef,
        pp_BillReference: orderRef,
      },
    };
  }

  async verifyWebhook(
    payload: Record<string, any>,
    _headers: Record<string, string | string[] | undefined>,
  ): Promise<VerificationResult> {
    this.assertConfigured();
    return this.verifyPayloadInternal(payload, 'webhook');
  }

  async verifyReturn(payloadOrQuery: Record<string, any>): Promise<VerificationResult> {
    this.assertConfigured();
    return this.verifyPayloadInternal(payloadOrQuery, 'return');
  }

  private verifyPayloadInternal(
    payload: Record<string, any>,
    source: 'webhook' | 'return',
  ): VerificationResult {
    const normalized: Record<string, string> = {};
    Object.entries(payload || {}).forEach(([k, v]) => {
      if (v === undefined || v === null) return;
      normalized[k] = String(v);
    });

    const providedHash = (normalized.pp_SecureHash || '').trim();
    const forHash = selectFieldsForCallbackHash(normalized);
    const signatureValid = verifyJazzCashSecureHash(this.integritySalt, forHash, providedHash);

    if (!signatureValid) {
      this.logger.warn(
        `JazzCash ${source}: ${JAZZ_ERROR_SIGNATURE_INVALID} (sanitized keys: ${Object.keys(normalized)
          .filter((k) => k !== 'pp_SecureHash' && k !== 'pp_Password')
          .join(',')})`,
      );
    }

    const ref =
      (normalized.pp_BillReference && String(normalized.pp_BillReference).trim()) ||
      (normalized.pp_TxnRefNo && String(normalized.pp_TxnRefNo).trim()) ||
      '';

    // Amount: gateway usually returns paisa as integer string; normalize to major PKR for Payment.amount compare.
    const paisaStr = (normalized.pp_Amount && String(normalized.pp_Amount).trim()) || '';
    const paisaNum = paisaStr ? parseInt(paisaStr, 10) : NaN;
    const amountMajor = Number.isFinite(paisaNum) ? paisaNum / 100 : undefined;

    const responseCode = (normalized.pp_ResponseCode || '').trim();
    // TODO(merchant doc): confirm success / pending / fail codes; "000" is common for success
    const gatewayPaymentSuccess = responseCode === '000';
    const status = !signatureValid
      ? PaymentStatus.PENDING
      : gatewayPaymentSuccess
        ? PaymentStatus.COMPLETED
        : responseCode
          ? PaymentStatus.FAILED
          : PaymentStatus.PENDING;

    return {
      verified: signatureValid,
      signatureValid,
      gatewayPaymentSuccess: signatureValid ? gatewayPaymentSuccess : false,
      status,
      providerTransactionId: normalized.pp_TxnRefNo || normalized.pp_TransactionID || ref,
      providerReference: ref,
      amount: amountMajor,
      amountPaisaRaw: paisaStr || undefined,
      currency: normalized.pp_TxnCurrency || 'PKR',
      failureReason: !signatureValid
        ? 'Invalid or missing provider signature'
        : gatewayPaymentSuccess
          ? undefined
          : normalized.pp_ResponseMessage || 'Payment not successful',
      errorCode: !signatureValid ? JAZZ_ERROR_SIGNATURE_INVALID : undefined,
      providerResponse: {
        pp_ResponseCode: normalized.pp_ResponseCode,
        pp_ResponseMessage: normalized.pp_ResponseMessage,
        pp_TxnRefNo: normalized.pp_TxnRefNo,
        pp_BillReference: normalized.pp_BillReference,
      },
      idempotencyKey: `jazzcash:${ref}:${normalized.pp_TxnRefNo || normalized.pp_TransactionID || ''}`,
    };
  }

  private buildTimestamp(date: Date): string {
    const yyyy = date.getUTCFullYear().toString();
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(date.getUTCDate()).padStart(2, '0');
    const hh = String(date.getUTCHours()).padStart(2, '0');
    const mi = String(date.getUTCMinutes()).padStart(2, '0');
    const ss = String(date.getUTCSeconds()).padStart(2, '0');
    return `${yyyy}${mm}${dd}${hh}${mi}${ss}`;
  }
}
