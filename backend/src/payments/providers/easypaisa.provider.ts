import { BadRequestException, Logger } from '@nestjs/common';
import { PaymentProvider, PaymentIntentResult, VerificationResult } from './payment-provider.interface';
import { PaymentDocument, PaymentStatus } from '../../schemas/payment.schema';
import { AppointmentDocument } from '../../schemas/appointment.schema';
import { UserDocument } from '../../schemas/user.schema';
import { buildEasypaisaRequestHash, verifyEasypaisaCallbackHmac } from '../easypaisa-secure-hash';

/**
 * EasyPaisa (easypay-style) payment provider — foundation for merchant checkout.
 * Field names and hash layout must be verified against your EasyPaisa merchant / sandbox PDF.
 * TODO(merchant): Replace {@link EASYPAY_DEFAULT_CHECKOUT_FORM_URL} and form field keys with the exact spec.
 */
const EASYPAY_DEFAULT_CHECKOUT_FORM_URL = 'https://easypaystg.easypaisa.com.pk/easypay/Index.jsf';

export const EASYPAISA_ERROR_NOT_CONFIGURED = 'PAYMENT_PROVIDER_NOT_CONFIGURED';

export class EasypaisaPaymentProvider implements PaymentProvider {
  private readonly logger = new Logger(EasypaisaPaymentProvider.name);
  private readonly envName: string;
  private readonly storeId: string;
  private readonly hashKey: string;
  private readonly accountNum: string;
  private readonly returnUrl: string;
  private readonly webhookUrl: string;
  private readonly checkoutFormUrl: string;

  constructor() {
    this.envName = (process.env.EASYPAISA_ENV || 'sandbox').toLowerCase();
    this.storeId = (process.env.EASYPAISA_STORE_ID || '').trim();
    this.hashKey = (process.env.EASYPAISA_HASH_KEY || '').trim();
    this.accountNum = (process.env.EASYPAISA_ACCOUNT_NUM || '').trim();
    this.returnUrl = (process.env.EASYPAISA_RETURN_URL || '').trim();
    this.webhookUrl = (process.env.EASYPAISA_WEBHOOK_URL || '').trim();
    this.checkoutFormUrl = (process.env.EASYPAISA_CHECKOUT_FORM_URL || EASYPAY_DEFAULT_CHECKOUT_FORM_URL).trim();
  }

  getProviderName() {
    return 'easypaisa' as const;
  }

  assertConfigured(): void {
    const miss: string[] = [];
    if (!this.storeId) miss.push('EASYPAISA_STORE_ID');
    if (!this.hashKey) miss.push('EASYPAISA_HASH_KEY');
    if (!this.accountNum) miss.push('EASYPAISA_ACCOUNT_NUM');
    if (!this.returnUrl) miss.push('EASYPAISA_RETURN_URL');
    if (!this.webhookUrl) miss.push('EASYPAISA_WEBHOOK_URL');
    if (miss.length) {
      throw new BadRequestException({
        code: EASYPAISA_ERROR_NOT_CONFIGURED,
        message: `EasyPaisa provider is not configured. Missing: ${miss.join(', ')}`,
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

    const orderRef = String(payment.referenceNumber || '').trim();
    if (!orderRef) {
      throw new BadRequestException('Payment must have a referenceNumber before creating EasyPaisa intent');
    }

    const amountPaisa = Math.round((payment.amount || 0) * 100).toString();
    const msisdn = (accountIdentifier || '').replace(/\D/g, '') || this.accountNum;
    const returnUrl = this.returnUrl;
    const orderHash = buildEasypaisaRequestHash(this.hashKey, this.storeId, orderRef, amountPaisa, msisdn, returnUrl);

    // TODO(merchant doc): use exact form field names required by the hosted checkout
    const fields: Record<string, string> = {
      storeId: this.storeId,
      orderId: orderRef,
      orderAmount: amountPaisa,
      orderRefNumber: orderRef,
      accountNum: this.accountNum,
      mobileNum: msisdn,
      emailAddress: (user as any).email || '',
      returnUrl,
      webHookUrl: this.webhookUrl,
      orderHash,
      productId: 'LK_CONSULT',
      productDescription: payment.description || `Consultation ${String(appointment._id)}`,
    };

    return {
      provider: 'easypaisa',
      providerEnv: this.envName,
      providerReference: orderRef,
      redirectFormPayload: {
        method: 'POST',
        action: this.checkoutFormUrl,
        fields,
      },
      providerResponse: {
        environment: this.envName,
        orderId: orderRef,
        formAction: this.checkoutFormUrl,
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

  async verifyReturn(payload: Record<string, any>): Promise<VerificationResult> {
    this.assertConfigured();
    return this.verifyPayloadInternal(payload, 'return');
  }

  private verifyPayloadInternal(
    raw: Record<string, any>,
    source: 'webhook' | 'return',
  ): VerificationResult {
    const normalized: Record<string, string> = {};
    Object.entries(raw || {}).forEach(([k, v]) => {
      if (v === undefined || v === null) return;
      normalized[k] = String(v);
    });

    const provided =
      (normalized.hash && String(normalized.hash)) ||
      (normalized.orderHash && String(normalized.orderHash)) ||
      (normalized.secureHash && String(normalized.secureHash)) ||
      '';
    const signatureValid = provided
      ? verifyEasypaisaCallbackHmac(this.hashKey, provided, normalized, 'sorted_kv')
      : false;

    if (!signatureValid) {
      this.logger.warn(`EasyPaisa ${source}: ${'PAYMENT_SIGNATURE_INVALID'} (orderId present=${!!normalized.orderId})`);
    }

    const ref =
      (normalized.orderId && String(normalized.orderId).trim()) ||
      (normalized.orderRefNumber && String(normalized.orderRefNumber).trim()) ||
      (normalized.merchantOrderId && String(normalized.merchantOrderId).trim()) ||
      '';

    const paisaStr =
      (normalized.orderAmount && String(normalized.orderAmount)) ||
      (normalized.transactionAmount && String(normalized.transactionAmount)) ||
      (normalized.amount && String(normalized.amount)) ||
      '';
    const paisaNum = paisaStr ? parseInt(paisaStr, 10) : NaN;
    const amountMajor = Number.isFinite(paisaNum) ? paisaNum / 100 : undefined;

    const st = (normalized.status || normalized.orderStatus || normalized.responseCode || normalized.transactionStatus || '')
      .toString()
      .toUpperCase();
    const successTokens = new Set(['000', '00', 'SUCCESS', 'SUCCEEDED', 'PAID', 'COMPLETED', '1', 'TRUE']);
    const failTokens = new Set(['FAIL', 'FAILED', 'CANCEL', 'CANCELLED', 'DECLINE', 'DECLINED']);

    let payStatus: PaymentStatus;
    if (!signatureValid) {
      payStatus = PaymentStatus.PENDING;
    } else if (successTokens.has(st)) {
      payStatus = PaymentStatus.COMPLETED;
    } else if (failTokens.has(st) || (st && st.includes('FAIL'))) {
      payStatus = PaymentStatus.FAILED;
    } else {
      payStatus = PaymentStatus.PENDING;
    }

    const gatewayPaymentSuccess = signatureValid && payStatus === PaymentStatus.COMPLETED;

    const txId = normalized.transactionId || normalized.transactionRef || normalized.transactionReference || ref;

    return {
      verified: signatureValid,
      signatureValid,
      gatewayPaymentSuccess: signatureValid && payStatus === PaymentStatus.COMPLETED,
      status: payStatus,
      providerTransactionId: txId,
      providerReference: ref,
      amount: amountMajor,
      amountPaisaRaw: paisaStr || undefined,
      currency: 'PKR',
      failureReason: !signatureValid
        ? 'Invalid EasyPaisa callback hash'
        : payStatus === PaymentStatus.FAILED
          ? normalized.message || normalized.responseMessage || 'Payment failed or declined'
          : undefined,
      errorCode: !signatureValid ? 'PAYMENT_SIGNATURE_INVALID' : undefined,
      providerResponse: {
        orderId: normalized.orderId,
        status: st,
        transactionId: txId,
      },
      idempotencyKey: `easypaisa:${ref}:${txId || ''}`,
    };
  }
}
