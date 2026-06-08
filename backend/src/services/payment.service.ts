import { Injectable, HttpException, HttpStatus, BadRequestException, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as crypto from 'crypto';
import PDFDocument from 'pdfkit';
import {
  AdminWalletStatus,
  EscrowStatus,
  Payment,
  PaymentDocument,
  PaymentMethod,
  PaymentStatus,
  PaymentType,
} from '../schemas/payment.schema';
import { Appointment, AppointmentDocument } from '../schemas/appointment.schema';
import { User, UserDocument } from '../schemas/user.schema';
import { PlatformWallet, PlatformWalletDocument } from '../schemas/platform-wallet.schema';
import { Payout, PayoutDocument, PayoutStatus } from '../schemas/payout.schema';
import { NotificationType } from '../schemas/notification.schema';
import { NotificationService } from './notification.service';
import { LawyerSubscriptionService } from './lawyer-subscription.service';
import { LawyerRegistrationService } from './lawyer-registration.service';
import { PaymentProviderFactory } from '../payments/payment-provider.factory';
import {
  PaymentProvider,
  SupportedPaymentProvider,
  VerificationResult,
} from '../payments/providers/payment-provider.interface';

type GatewayCallbackProvider = 'jazzcash' | 'easypaisa';

const PLATFORM_WALLET_ID = 'platform';

export const PAYMENT_ERROR = {
  NOT_FOUND: 'PAYMENT_NOT_FOUND',
  SIGNATURE_INVALID: 'PAYMENT_SIGNATURE_INVALID',
  AMOUNT_MISMATCH: 'PAYMENT_AMOUNT_MISMATCH',
  CALLBACK_CONFLICT: 'PAYMENT_CALLBACK_CONFLICT',
  STATUS_TRANSITION: 'PAYMENT_STATUS_TRANSITION',
} as const;

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private readonly paymentProviderName: SupportedPaymentProvider;
  private readonly paymentProvider: PaymentProvider;

  constructor(
    @InjectModel(Payment.name) private paymentModel: Model<PaymentDocument>,
    @InjectModel(Appointment.name) private appointmentModel: Model<AppointmentDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(PlatformWallet.name) private platformWalletModel: Model<PlatformWalletDocument>,
    @InjectModel(Payout.name) private payoutModel: Model<PayoutDocument>,
    private notificationService: NotificationService,
    @Inject(forwardRef(() => LawyerSubscriptionService))
    private lawyerSubscriptionService: LawyerSubscriptionService,
    @Inject(forwardRef(() => LawyerRegistrationService))
    private lawyerRegistrationService: LawyerRegistrationService,
  ) {
    this.paymentProviderName = PaymentProviderFactory.resolveProviderNameFromEnv();
    this.paymentProvider = PaymentProviderFactory.create(this.paymentProviderName);
  }

  private getPlatformFeeConfig() {
    const feeType = (process.env.PLATFORM_FEE_TYPE || 'percentage').trim().toLowerCase();
    const feePercent = Number(process.env.PLATFORM_FEE_PERCENT || 10);
    const feeFixed = Number(process.env.PLATFORM_FEE_FIXED || 0);
    return {
      type: feeType === 'fixed' ? 'fixed' : 'percentage',
      percent: Number.isFinite(feePercent) ? Math.max(0, feePercent) : 10,
      fixed: Number.isFinite(feeFixed) ? Math.max(0, feeFixed) : 0,
    } as const;
  }

  /**
   * Consultation checkout: platform fee is added on top of the lawyer's consultation fee.
   * Citizen pays consultationFee + platformFee; lawyer receives full consultationFee.
   */
  private computeFeeBreakdown(consultationFee: number) {
    const base = Math.max(0, Number(consultationFee || 0));
    const cfg = this.getPlatformFeeConfig();
    const rawFee = cfg.type === 'fixed' ? cfg.fixed : (base * cfg.percent) / 100;
    const platformFee = Math.max(0, Math.round(rawFee));
    const totalPayable = base + platformFee;
    return {
      consultationFee: base,
      grossAmount: totalPayable,
      platformFee,
      lawyerAmount: base,
      platformRevenue: platformFee,
      platformFeePercent: cfg.type === 'percentage' ? cfg.percent : 0,
    };
  }

  /** Exposed for optional Stripe checkout (does not affect mock/manual gateway flow). */
  computeFeeBreakdownForAmount(consultationFee: number) {
    return this.computeFeeBreakdown(consultationFee);
  }

  /** Exposed for optional Stripe webhook completion. */
  async markPaymentCompletedFromProvider(
    payment: PaymentDocument,
    opts: {
      providerTransactionId?: string;
      providerReference?: string;
      providerResponse?: Record<string, any>;
      idempotencyKey?: string;
    },
    meta?: { source?: string },
  ) {
    await this.applyVerifiedSuccess(payment, opts, meta);
  }

  private maskAccountIdentifier(v?: string) {
    const value = String(v || '').trim();
    if (!value) return undefined;
    const clean = value.replace(/\s+/g, '');
    if (clean.length <= 4) return `****${clean}`;
    return `${'*'.repeat(Math.max(0, clean.length - 4))}${clean.slice(-4)}`;
  }

  /** Used for checkout UX only; mirrors JazzCash provider credential checks (no secrets returned). */
  private static jazzcashEnvComplete(): boolean {
    const keys = [
      process.env.JAZZCASH_MERCHANT_ID,
      process.env.JAZZCASH_PASSWORD,
      process.env.JAZZCASH_INTEGRITY_SALT,
      process.env.JAZZCASH_RETURN_URL,
      process.env.JAZZCASH_WEBHOOK_URL,
    ];
    return keys.every((v) => String(v || '').trim().length > 0);
  }

  private static easypaisaEnvComplete(): boolean {
    const keys = [
      process.env.EASYPAISA_STORE_ID,
      process.env.EASYPAISA_HASH_KEY,
      process.env.EASYPAISA_ACCOUNT_NUM,
      process.env.EASYPAISA_RETURN_URL,
      process.env.EASYPAISA_WEBHOOK_URL,
    ];
    return keys.every((v) => String(v || '').trim().length > 0);
  }

  private static cardSecretsPresent(): boolean {
    const keys = [
      process.env.CARD_PROVIDER,
      process.env.CARD_SECRET_KEY,
      process.env.CARD_WEBHOOK_SECRET,
      process.env.CARD_RETURN_URL,
      process.env.CARD_WEBHOOK_URL,
    ];
    return keys.every((v) => String(v || '').trim().length > 0);
  }

  /**
   * Safe, non-secret summary for citizen checkout UI (demo vs live gateway labeling).
   * Does not initiate payments.
   */
  getCitizenCheckoutContext(): {
    success: true;
    data: {
      paymentProvider: SupportedPaymentProvider;
      providerDisplayLabel: string;
      isDemoManualMode: boolean;
      demoManualNotice?: string;
      manualModeExplanation?: string;
      jazzcashSandbox: boolean;
      easypaisaSandbox: boolean;
      jazzcashConfigured: boolean;
      easypaisaConfigured: boolean;
      cardEnvPresent: boolean;
      /** Card PSP checkout is still not wired in CardPaymentProvider even when env vars exist */
      liveCardGatewayImplemented: boolean;
      allowedMethodIds: Array<'manual' | 'jazzcash' | 'easypaisa' | 'card'>;
      cardUiMode: 'hidden' | 'demo_manual_instructions' | 'unavailable';
      checkoutBlocked: boolean;
      checkoutBlockedReason?: string;
      gatewayConfigWarnings: string[];
    };
  } {
    const p = this.paymentProviderName;
    const jazzOk = PaymentService.jazzcashEnvComplete();
    const easyOk = PaymentService.easypaisaEnvComplete();

    const isDemoManualMode = p === 'manual';
    const jazzcashSandbox =
      p === 'jazzcash' && (process.env.JAZZCASH_ENV || 'sandbox').toLowerCase() !== 'production';
    const easypaisaSandbox =
      p === 'easypaisa' && (process.env.EASYPAISA_ENV || 'sandbox').toLowerCase() !== 'production';

    const providerDisplayLabel =
      p === 'manual'
        ? 'Manual / Demo Payment Mode'
        : p === 'jazzcash'
          ? 'JazzCash Payment'
          : p === 'easypaisa'
            ? 'EasyPaisa Payment'
            : 'Card Payment';

    let allowedMethodIds: Array<'manual' | 'jazzcash' | 'easypaisa' | 'card'> = [];
    let cardUiMode: 'hidden' | 'demo_manual_instructions' | 'unavailable' = 'hidden';
    let checkoutBlocked = false;
    let checkoutBlockedReason: string | undefined;
    const gatewayConfigWarnings: string[] = [];

    if (p === 'manual') {
      allowedMethodIds = ['manual', 'jazzcash', 'easypaisa', 'card'];
      cardUiMode = 'demo_manual_instructions';
    } else if (p === 'jazzcash') {
      allowedMethodIds = ['jazzcash'];
      if (!jazzOk) {
        gatewayConfigWarnings.push(
          'JazzCash is the active gateway but merchant credentials are incomplete. Add the JazzCash variables from .env.example before demoing live checkout.',
        );
      }
    } else if (p === 'easypaisa') {
      allowedMethodIds = ['easypaisa'];
      if (!easyOk) {
        gatewayConfigWarnings.push(
          'EasyPaisa is the active gateway but merchant credentials are incomplete. Add the EasyPaisa variables from .env.example.',
        );
      }
    } else {
      allowedMethodIds = [];
      cardUiMode = 'unavailable';
      checkoutBlocked = true;
      checkoutBlockedReason =
        'Live card gateway checkout is not enabled in this application build—even if CARD_* variables are set. For FYP demos, set PAYMENT_PROVIDER=manual (or jazzcash/easypaisa with credentials).';
    }

    /** Card PSP session creation is not implemented; manual mode only uses demo instructions for “card”. */
    const liveCardGatewayImplemented = false;

    return {
      success: true,
      data: {
        paymentProvider: p,
        providerDisplayLabel,
        isDemoManualMode,
        demoManualNotice: isDemoManualMode ? 'Demo payment mode is enabled for testing.' : undefined,
        manualModeExplanation: isDemoManualMode
          ? 'Manual, JazzCash, EasyPaisa, and card-style options below use simulated or bank-transfer flows—not live PSP checkout—until PAYMENT_PROVIDER is set to jazzcash or easypaisa with merchant credentials.'
          : undefined,
        jazzcashSandbox,
        easypaisaSandbox,
        jazzcashConfigured: jazzOk,
        easypaisaConfigured: easyOk,
        cardEnvPresent: PaymentService.cardSecretsPresent(),
        liveCardGatewayImplemented,
        allowedMethodIds,
        cardUiMode,
        checkoutBlocked,
        checkoutBlockedReason,
        gatewayConfigWarnings,
      },
    };
  }

  // Initiate payment for an appointment
  async initiatePayment(
    citizenId: string,
    appointmentId: string,
    method: PaymentMethod,
    accountIdentifier?: string, // Phone number for JazzCash/EasyPaisa
  ) {
    let cid: Types.ObjectId;
    let aid: Types.ObjectId;
    try {
      cid = new Types.ObjectId(citizenId);
      aid = new Types.ObjectId(appointmentId);
    } catch {
      throw new BadRequestException('Invalid appointment or user id');
    }

    const appointment = await this.appointmentModel.findOne({
      _id: aid,
      citizenId: cid,
    }).exec();

    if (!appointment) {
      throw new HttpException(
        'Appointment not found. Use Pay Now from My Appointments.',
        HttpStatus.NOT_FOUND,
      );
    }

    if (appointment.status !== 'confirmed') {
      throw new HttpException(
        'Payment is only available after the lawyer confirms your appointment. Please wait for confirmation.',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (appointment.isPaid) {
      throw new HttpException('This appointment is already paid', HttpStatus.BAD_REQUEST);
    }

    const normalizedMethod = method === PaymentMethod.BANK_TRANSFER ? PaymentMethod.MANUAL : method;
    if (this.paymentProviderName === 'jazzcash' && normalizedMethod !== PaymentMethod.JAZZCASH) {
      throw new BadRequestException('Selected method does not match configured provider JazzCash');
    }
    if (this.paymentProviderName === 'easypaisa' && normalizedMethod !== PaymentMethod.EASYPAISA) {
      throw new BadRequestException('Selected method does not match configured provider EasyPaisa');
    }
    if (this.paymentProviderName === 'card' && normalizedMethod !== PaymentMethod.CARD) {
      throw new BadRequestException('Selected method does not match configured card provider');
    }

    const citizen = await this.userModel.findById(cid).exec();
    if (!citizen) {
      throw new HttpException('Citizen not found', HttpStatus.NOT_FOUND);
    }

    // Check if there's already a pending payment
    const existingPayment = await this.paymentModel.findOne({
      appointmentId: aid,
      status: PaymentStatus.PENDING,
    });

    if (existingPayment) {
      throw new HttpException('A payment is already in progress for this appointment', HttpStatus.BAD_REQUEST);
    }

    // Calculate platform fee using env config
    const fee = this.computeFeeBreakdown(appointment.fee);

    // Unique internal reference for gateway + DB lookup (high-entropy suffix)
    const referenceNumber = `LK${Date.now()}-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;

    // Create payment record
    const payment = new this.paymentModel({
      citizenId: new Types.ObjectId(citizenId),
      lawyerId: appointment.lawyerId,
      appointmentId: appointment._id,
      amount: fee.grossAmount,
      method: normalizedMethod,
      status: PaymentStatus.PENDING,
      type: PaymentType.CONSULTATION_FEE,
      referenceNumber,
      platformFeePercent: fee.platformFeePercent,
      platformFeeAmount: fee.platformFee,
      platformFee: fee.platformFee,
      lawyerAmount: fee.lawyerAmount,
      platformRevenue: fee.platformRevenue,
      adminWalletStatus: AdminWalletStatus.NOT_RECEIVED,
      escrowStatus: appointment.fee > 0 ? EscrowStatus.NOT_APPLICABLE : EscrowStatus.NOT_APPLICABLE,
      citizenPaymentMethod: {
        type:
          normalizedMethod === PaymentMethod.JAZZCASH
            ? 'jazzcash'
            : normalizedMethod === PaymentMethod.EASYPAISA
              ? 'easypaisa'
              : normalizedMethod === PaymentMethod.CARD
                ? 'card'
                : 'manual',
        accountLabel:
          normalizedMethod === PaymentMethod.JAZZCASH
            ? 'JazzCash'
            : normalizedMethod === PaymentMethod.EASYPAISA
              ? 'EasyPaisa'
              : normalizedMethod === PaymentMethod.CARD
                ? 'Card'
                : 'Manual / Bank Transfer',
        accountLast4:
          normalizedMethod === PaymentMethod.CARD ? this.maskAccountIdentifier(accountIdentifier) : undefined,
        mobileNumberMasked:
          normalizedMethod === PaymentMethod.JAZZCASH || normalizedMethod === PaymentMethod.EASYPAISA
            ? this.maskAccountIdentifier(accountIdentifier)
            : undefined,
      },
      description: `Consultation fee for appointment on ${appointment.appointmentDate.toDateString()}`,
      provider: this.paymentProviderName,
      providerEnv:
        this.paymentProviderName === 'manual'
          ? 'manual'
          : this.paymentProviderName === 'jazzcash'
            ? ((process.env.JAZZCASH_ENV || 'sandbox').trim().toLowerCase() || 'sandbox')
            : this.paymentProviderName === 'easypaisa'
              ? ((process.env.EASYPAISA_ENV || 'sandbox').trim().toLowerCase() || 'sandbox')
              : this.paymentProviderName === 'card'
                ? (process.env.CARD_PROVIDER || 'card').trim() || 'card'
                : 'sandbox',
    });

    const intent = await this.paymentProvider.createPaymentIntent(
      payment,
      appointment,
      citizen,
      accountIdentifier,
    );
    const manualWalletInfo = {
      bankName: process.env.ADMIN_WALLET_BANK_NAME || '',
      accountTitle: process.env.ADMIN_WALLET_ACCOUNT_TITLE || 'LawyersKonnect',
      accountNumber: process.env.ADMIN_WALLET_ACCOUNT_NUMBER || '',
      iban: process.env.ADMIN_WALLET_IBAN || '',
      jazzcashTitle: process.env.ADMIN_WALLET_JAZZCASH_TITLE || '',
      jazzcashNumber: process.env.ADMIN_WALLET_JAZZCASH_NUMBER || '',
      easypaisaTitle: process.env.ADMIN_WALLET_EASYPAISA_TITLE || '',
      easypaisaNumber: process.env.ADMIN_WALLET_EASYPAISA_NUMBER || '',
    };
    payment.providerReference = intent.providerReference || payment.referenceNumber;
    payment.providerResponse = intent.providerResponse || {};
    await payment.save();

    // Return payment details with provider instructions
    await this.notificationService.createNotification(
      payment.citizenId!.toString(),
      NotificationType.ACCOUNT_UPDATE,
      'Payment initiated',
      `Complete your consultation payment of PKR ${payment.amount} (includes platform service fee) to unlock consultation chat.`,
      { paymentId: payment._id.toString(), appointmentId: appointment._id.toString() },
      `/client/payments/checkout/${appointment._id.toString()}`,
    );

    return {
      success: true,
      message: 'Payment initiated successfully',
      data: {
        paymentId: payment._id.toString(),
        _id: payment._id.toString(),
        referenceNumber,
        amount: payment.amount,
        method: normalizedMethod,
        provider: this.paymentProviderName,
        feeBreakdown: {
          consultationFee: fee.consultationFee,
          platformFee: fee.platformFee,
          platformFeePercent: fee.platformFeePercent,
          totalPayable: fee.grossAmount,
        },
        providerReference: payment.providerReference,
        gatewayInfo:
          this.paymentProviderName === 'manual'
            ? {
                ...(intent.gatewayInfo || {}),
                receivingWallet: manualWalletInfo,
                instruction:
                  'Please send the amount to LawyersKonnect wallet and use this reference number.',
              }
            : intent.gatewayInfo || null,
        checkoutUrl: intent.checkoutUrl,
        redirectFormPayload: intent.redirectFormPayload,
      },
    };
  }

  /** UC-06: Record failed payment attempt (declined or gateway unavailable) */
  async recordPaymentFailure(
    paymentId: string,
    code: 'declined' | 'gateway_unavailable',
    reason?: string,
  ) {
    const pid = new Types.ObjectId(paymentId);
    const payment = await this.paymentModel.findOne({ _id: pid, status: PaymentStatus.PENDING });
    if (!payment) {
      throw new HttpException('Payment not found or already processed', HttpStatus.NOT_FOUND);
    }
    payment.status = PaymentStatus.FAILED;
    payment.gatewayResponse = { status: 'failed', code, reason, failedAt: new Date() };
    await payment.save();

    const notifyUserId =
      payment.type === PaymentType.SUBSCRIPTION_FEE ||
      payment.type === PaymentType.LAWYER_REGISTRATION_FEE
        ? payment.payerId?.toString() || payment.lawyerId.toString()
        : payment.citizenId?.toString();
    if (notifyUserId) {
      if (payment.type === PaymentType.LAWYER_REGISTRATION_FEE) {
        await this.notificationService.createNotification(
          notifyUserId,
          NotificationType.PAYMENT_FAILED,
          'Registration payment failed',
          reason || 'Your registration payment could not be completed.',
          { paymentId: payment._id.toString() },
          '/auth/lawyer/registration-payment',
        );
      } else if (payment.type === PaymentType.SUBSCRIPTION_FEE) {
        await this.notificationService.createNotification(
          notifyUserId,
          NotificationType.SUBSCRIPTION_PAYMENT_FAILED,
          'Subscription payment failed',
          reason || 'Your subscription payment could not be completed.',
          { paymentId: payment._id.toString() },
          '/lawyer/subscription',
        );
      } else {
        await this.notificationService.createPaymentNotification(
          notifyUserId,
          'payment_failed',
          payment,
          { actionUrl: `/payments/${payment._id.toString()}` },
        );
      }
    }

    return { success: true, message: 'Failure recorded' };
  }

  // Confirm payment (manual/provider verified) or record failure (UC-06)
  async confirmPayment(
    paymentId: string,
    citizenId: string,
    transactionId?: string,
    failure?: { code: 'declined' | 'gateway_unavailable'; reason?: string },
  ) {
    const pid = new Types.ObjectId(paymentId);
    const payment = await this.paymentModel.findById(pid);
    if (!payment) {
      throw new HttpException('Payment not found', HttpStatus.NOT_FOUND);
    }

    const prov = (payment.provider || this.paymentProviderName) as SupportedPaymentProvider;
    if (prov !== 'manual') {
      const providerLabel =
        prov === 'jazzcash'
          ? 'JazzCash'
          : prov === 'easypaisa'
            ? 'EasyPaisa'
            : prov === 'card'
              ? 'card'
              : 'gateway';
      throw new HttpException(
        `Manual confirmation is not allowed for ${providerLabel} payments.`,
        HttpStatus.BAD_REQUEST,
      );
    }

    if (payment.status !== PaymentStatus.PENDING) {
      throw new HttpException('This payment cannot be confirmed', HttpStatus.BAD_REQUEST);
    }

    if (payment.type === PaymentType.SUBSCRIPTION_FEE) {
      throw new HttpException(
        'Use lawyer subscription confirm endpoint for subscription payments',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!payment.citizenId || payment.citizenId.toString() !== citizenId) {
      throw new HttpException('Forbidden resource', HttpStatus.FORBIDDEN);
    }

    if (payment.appointmentId) {
      const appointment = await this.appointmentModel.findById(payment.appointmentId);
      if (
        !appointment ||
        appointment.citizenId.toString() !== citizenId ||
        appointment.lawyerId.toString() !== payment.lawyerId.toString()
      ) {
        throw new HttpException('Forbidden resource', HttpStatus.FORBIDDEN);
      }
    }

    // UC-06: Handle gateway declined or unavailable
    if (failure?.code) {
      await this.recordPaymentFailure(paymentId, failure.code, failure.reason);
      if (failure.code === 'gateway_unavailable') {
        throw new HttpException(
          'Payment service unavailable, try again',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      throw new HttpException('Payment declined', HttpStatus.BAD_REQUEST);
    }

    await this.applyVerifiedSuccess(
      payment,
      {
        providerTransactionId: transactionId || `TXN${Date.now()}`,
        providerReference: payment.providerReference || payment.referenceNumber,
        providerResponse: { status: 'success', source: 'manual_confirm' },
        idempotencyKey: payment.idempotencyKey || payment.referenceNumber,
      },
      { source: 'manual_confirm' },
    );

    return {
      success: true,
      message: 'Payment confirmed successfully',
      data: payment,
    };
  }

  async handleJazzcashWebhook(
    payload: Record<string, any>,
    headers: Record<string, string | string[] | undefined>,
  ) {
    const provider = PaymentProviderFactory.create('jazzcash');
    const verification = await provider.verifyWebhook(payload, headers);
    return this.processGatewayProviderCallback(verification, payload, 'webhook', 'jazzcash');
  }

  async handleEasypaisaWebhook(
    payload: Record<string, any>,
    headers: Record<string, string | string[] | undefined>,
  ) {
    const provider = PaymentProviderFactory.create('easypaisa');
    const verification = await provider.verifyWebhook(payload, headers);
    return this.processGatewayProviderCallback(verification, payload, 'webhook', 'easypaisa');
  }

  /**
   * Browser return: verify with gateway provider, apply shared callback logic, redirect to SPA.
   */
  async jazzCashReturnRedirectUrlAsync(query: Record<string, any>): Promise<string> {
    const provider = PaymentProviderFactory.create('jazzcash');
    const verification = await provider.verifyReturn(query);
    try {
      const result = await this.processGatewayProviderCallback(verification, query, 'return', 'jazzcash');
      return this.buildGatewayBrowserRedirectUrl(result, 'success');
    } catch (err: unknown) {
      if (err instanceof HttpException) {
        const body = err.getResponse();
        if (typeof body === 'object' && body !== null && 'code' in body) {
          const r = body as { code?: string; message?: string };
          return this.buildGatewayBrowserRedirectUrlFromError(r.code, r.message);
        }
        if (typeof body === 'string') {
          return this.buildGatewayBrowserRedirectUrlFromError(undefined, body);
        }
      }
      const msg = err instanceof Error ? err.message : String(err);
      return this.buildGatewayBrowserRedirectUrlFromError('ERROR', msg);
    }
  }

  async easyPaisaReturnRedirectUrlAsync(query: Record<string, any>): Promise<string> {
    const provider = PaymentProviderFactory.create('easypaisa');
    const verification = await provider.verifyReturn(query);
    try {
      const result = await this.processGatewayProviderCallback(verification, query, 'return', 'easypaisa');
      return this.buildGatewayBrowserRedirectUrl(result, 'success');
    } catch (err: unknown) {
      if (err instanceof HttpException) {
        const body = err.getResponse();
        if (typeof body === 'object' && body !== null && 'code' in body) {
          const r = body as { code?: string; message?: string };
          return this.buildGatewayBrowserRedirectUrlFromError(r.code, r.message);
        }
        if (typeof body === 'string') {
          return this.buildGatewayBrowserRedirectUrlFromError(undefined, body);
        }
      }
      const msg = err instanceof Error ? err.message : String(err);
      return this.buildGatewayBrowserRedirectUrlFromError('ERROR', msg);
    }
  }

  /**
   * Shared gateway callback processing (JazzCash, EasyPaisa): webhook JSON or return redirect query.
   */
  private async processGatewayProviderCallback(
    verification: VerificationResult,
    rawPayload: Record<string, any>,
    source: 'webhook' | 'return',
    providerName: GatewayCallbackProvider,
  ) {
    const ref = this.extractGatewayOrderRef(providerName, verification, rawPayload);
    if (!ref) {
      throw new HttpException(
        { code: 'PAYMENT_CALLBACK_INVALID', message: 'Missing payment reference in callback' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const payment = await this.paymentModel.findOne({
      provider: providerName,
      $or: [{ referenceNumber: ref }, { providerReference: ref }],
    });
    if (!payment) {
      this.logger.warn(`${providerName} ${source}: ${PAYMENT_ERROR.NOT_FOUND} ref=${this.redactRef(ref)}`);
      throw new HttpException(
        { code: PAYMENT_ERROR.NOT_FOUND, message: 'Payment not found for provider reference' },
        HttpStatus.NOT_FOUND,
      );
    }

    const sanitized = this.sanitizeProviderPayload(rawPayload);
    const signatureValid = verification.signatureValid ?? verification.verified;

    // Idempotent replay: same gateway transaction id on an already completed row
    if (payment.status === PaymentStatus.COMPLETED) {
      const sameTxn = this.isSameGatewayTransaction(payment, verification);
      if (sameTxn) {
        this.logger.log(
          `${providerName} ${source}: idempotent success for payment ${payment._id} ref=${this.redactRef(ref)}`,
        );
        return {
          success: true,
          idempotent: true,
          message: 'Callback already applied',
          data: payment,
          outcome: 'completed' as const,
        };
      }
      this.logger.warn(
        `${providerName} ${source}: ${PAYMENT_ERROR.CALLBACK_CONFLICT} paymentId=${payment._id} ref=${this.redactRef(ref)}`,
      );
      throw new HttpException(
        {
          code: PAYMENT_ERROR.CALLBACK_CONFLICT,
          message: 'Conflicting callback for an already completed payment',
        },
        HttpStatus.CONFLICT,
      );
    }

    // Failed row: do not allow "late success" without a new payment intent
    if (payment.status === PaymentStatus.FAILED) {
      if (signatureValid && verification.gatewayPaymentSuccess && verification.status === PaymentStatus.COMPLETED) {
        throw new HttpException(
          {
            code: PAYMENT_ERROR.STATUS_TRANSITION,
            message:
              'Payment is failed; a new success callback is not accepted. Re-initiate payment from checkout.',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      // Allow idempotent failure replays (no state change)
      if (!signatureValid) {
        throw new HttpException(
          { code: PAYMENT_ERROR.SIGNATURE_INVALID, message: 'Invalid gateway signature' },
          HttpStatus.BAD_REQUEST,
        );
      }
      return {
        success: true,
        idempotent: true,
        message: 'Failure already recorded',
        data: payment,
        outcome: 'failed' as const,
      };
    }

    if (!signatureValid) {
      this.logger.warn(
        `${providerName} ${source}: ${PAYMENT_ERROR.SIGNATURE_INVALID} paymentId=${payment._id} ref=${this.redactRef(ref)}`,
      );
      throw new HttpException(
        { code: PAYMENT_ERROR.SIGNATURE_INVALID, message: 'Invalid gateway signature' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const amountCheck = this.validateGatewayCallbackAmount(payment, verification);
    if (!amountCheck.ok) {
      this.logger.warn(
        `${providerName} ${source}: ${PAYMENT_ERROR.AMOUNT_MISMATCH} paymentId=${payment._id} expectedPaisa=${amountCheck.expectedPaisa} got=${amountCheck.gotPaisaRaw}`,
      );
      await this.applyVerifiedFailure(
        payment,
        amountCheck.reason || 'Amount mismatch',
        { providerResponse: sanitized },
        { allowFromCompleted: false },
      );
      throw new HttpException(
        { code: PAYMENT_ERROR.AMOUNT_MISMATCH, message: 'Callback amount does not match payment' },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (verification.status === PaymentStatus.COMPLETED && verification.gatewayPaymentSuccess) {
      await this.applyVerifiedSuccess(
        payment,
        {
          providerTransactionId: verification.providerTransactionId,
          providerReference: verification.providerReference || ref,
          providerResponse: sanitized,
          idempotencyKey: verification.idempotencyKey,
        },
        { source: `${providerName}_${source}` },
      );
      const fresh = await this.paymentModel.findById(payment._id).exec();
      return {
        success: true,
        message: 'Payment verified and completed',
        data: fresh || payment,
        outcome: 'completed' as const,
      };
    }

    if (verification.status === PaymentStatus.FAILED || verification.status === PaymentStatus.CANCELLED) {
      await this.applyVerifiedFailure(
        payment,
        verification.failureReason || 'Payment failed',
        { providerResponse: sanitized },
        { allowFromCompleted: false },
      );
      const fresh = await this.paymentModel.findById(payment._id).exec();
      return {
        success: true,
        message: 'Payment marked failed',
        data: fresh || payment,
        outcome: 'failed' as const,
      };
    }

    payment.status = PaymentStatus.PENDING;
    payment.providerResponse = { ...(payment.providerResponse || {}), ...sanitized };
    if (verification.idempotencyKey) {
      payment.idempotencyKey = verification.idempotencyKey;
    }
    await payment.save();
    return {
      success: true,
      message: 'Payment remains pending',
      data: payment,
      outcome: 'pending' as const,
    };
  }

  private extractGatewayOrderRef(
    providerName: GatewayCallbackProvider,
    verification: VerificationResult,
    raw: Record<string, any>,
  ): string | undefined {
    const v = (verification.providerReference && String(verification.providerReference).trim()) || '';
    if (v) {
      return v;
    }
    if (providerName === 'jazzcash') {
      const r =
        (raw?.pp_BillReference && String(raw.pp_BillReference).trim()) ||
        (raw?.pp_TxnRefNo && String(raw.pp_TxnRefNo).trim()) ||
        '';
      return r || undefined;
    }
    const r =
      (raw?.orderId && String(raw.orderId).trim()) ||
      (raw?.orderRefNumber && String(raw.orderRefNumber).trim()) ||
      (raw?.merchantOrderId && String(raw.merchantOrderId).trim()) ||
      '';
    return r || undefined;
  }

  private redactRef(ref: string): string {
    if (ref.length <= 8) return '***';
    return `${ref.slice(0, 4)}…${ref.slice(-4)}`;
  }

  private isSameGatewayTransaction(payment: PaymentDocument, verification: VerificationResult): boolean {
    const vTxn = (verification.providerTransactionId || '').trim();
    const pTxn = (payment.providerTransactionId || payment.transactionId || '').toString().trim();
    if (vTxn && pTxn && vTxn === pTxn) {
      return true;
    }
    if (verification.idempotencyKey && payment.idempotencyKey && verification.idempotencyKey === payment.idempotencyKey) {
      return true;
    }
    return false;
  }

  private validateGatewayCallbackAmount(
    payment: PaymentDocument,
    verification: VerificationResult,
  ): { ok: boolean; reason?: string; expectedPaisa?: number; gotPaisaRaw?: string } {
    const expectedPaisa = Math.round(Number(payment.amount) * 100);
    const raw = verification.amountPaisaRaw?.trim();
    if (!raw) {
      return { ok: false, reason: 'Missing amount in callback', expectedPaisa, gotPaisaRaw: raw };
    }
    const got = parseInt(raw, 10);
    if (!Number.isFinite(got)) {
      return { ok: false, reason: 'Invalid amount in callback', expectedPaisa, gotPaisaRaw: raw };
    }
    if (got !== expectedPaisa) {
      return { ok: false, reason: 'Amount mismatch', expectedPaisa, gotPaisaRaw: raw };
    }
    return { ok: true, expectedPaisa, gotPaisaRaw: raw };
  }

  private buildGatewayBrowserRedirectUrl(
    result: {
      success?: boolean;
      outcome?: 'completed' | 'failed' | 'pending';
      idempotent?: boolean;
      data?: PaymentDocument;
    },
    _kind: string,
  ): string {
    const base = this.resolveFrontendBaseForRedirect();
    const pid = result.data?._id?.toString() || '';
    const status = result.outcome || 'pending';
    const idem = result.idempotent ? '1' : '0';
    if (result.data?.type === PaymentType.SUBSCRIPTION_FEE) {
      return `${base}/lawyer/subscription?paymentResult=${encodeURIComponent(status)}&paymentId=${encodeURIComponent(pid)}&idempotent=${encodeURIComponent(idem)}`;
    }
    return `${base}/client/payments?paymentResult=${encodeURIComponent(status)}&paymentId=${encodeURIComponent(pid)}&idempotent=${encodeURIComponent(idem)}`;
  }

  private buildGatewayBrowserRedirectUrlFromError(code: string | undefined, message: string | undefined): string {
    const base = this.resolveFrontendBaseForRedirect();
    const c = code || 'ERROR';
    const m = message || '';
    return `${base}/client/payments?paymentResult=error&code=${encodeURIComponent(c)}&message=${encodeURIComponent(m)}`;
  }

  /**
   * Production: FRONTEND_URL is required (no localhost default). Dev: allow FRONTEND_URL or localhost:5173.
   */
  private resolveFrontendBaseForRedirect(): string {
    const fe = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
    const isProd = process.env.NODE_ENV === 'production';
    if (isProd) {
      if (!fe) {
        throw new HttpException(
          'FRONTEND_URL is required in production for payment return redirects',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
      return fe;
    }
    return fe || 'http://localhost:5173';
  }

  private async applyVerifiedSuccess(
    payment: PaymentDocument,
    opts: {
      providerTransactionId?: string;
      providerReference?: string;
      providerResponse?: Record<string, any>;
      idempotencyKey?: string;
    },
    meta?: { source?: string },
  ) {
    const currentTypeCheck = await this.paymentModel.findById(payment._id).select('type').lean().exec();
    if (currentTypeCheck?.type === PaymentType.SUBSCRIPTION_FEE) {
      await this.lawyerSubscriptionService.activateFromPayment(payment, {
        providerTransactionId: opts.providerTransactionId,
        providerReference: opts.providerReference,
        idempotencyKey: opts.idempotencyKey,
        source: meta?.source,
      });
      return;
    }
    if (currentTypeCheck?.type === PaymentType.LAWYER_REGISTRATION_FEE) {
      await this.lawyerRegistrationService.activateFromPayment(payment, {
        providerTransactionId: opts.providerTransactionId,
        providerReference: opts.providerReference,
        idempotencyKey: opts.idempotencyKey,
        source: meta?.source,
      });
      return;
    }

    const sourceStr = (meta?.source || '') as string;
    const isJazz = sourceStr.startsWith('jazzcash');
    const isEasypaisa = sourceStr.startsWith('easypaisa');
    const isGateway = isJazz || isEasypaisa;
    const txId = opts.providerTransactionId || `TXN${Date.now()}`;
    const now = new Date();
    const current = await this.paymentModel.findById(payment._id).exec();
    if (!current) {
      return;
    }
    const receiptNumber = current.receiptNumber || `RCP-${Date.now()}`;

    const setDoc: Record<string, unknown> = {
      status: PaymentStatus.COMPLETED,
      providerTransactionId: txId,
      transactionId: txId,
      providerReference: opts.providerReference || current.providerReference,
      completedAt: now,
      paidAt: now,
      receiptNumber,
      adminWalletStatus: AdminWalletStatus.RECEIVED,
      escrowStatus: Number(current.amount || 0) > 0 ? EscrowStatus.HELD : EscrowStatus.NOT_APPLICABLE,
      providerResponse: {
        ...((current.providerResponse as Record<string, unknown>) || {}),
        ...(opts.providerResponse || {}),
      },
      gatewayResponse: {
        ...((current.gatewayResponse as Record<string, unknown>) || {}),
        status: 'success',
        transactionId: txId,
        completedAt: now,
        ...(isGateway
          ? {
              gatewayProvider: isJazz ? 'jazzcash' : 'easypaisa',
              gatewayCompletionNotified: true,
              ...(isJazz ? { jazzCashSource: meta?.source, jazzCashCompletionNotified: true } : {}),
              ...(isEasypaisa ? { easypaisaSource: meta?.source, easypaisaCompletionNotified: true } : {}),
            }
          : { manualSource: meta?.source }),
      },
    };
    if (opts.idempotencyKey) {
      setDoc.idempotencyKey = opts.idempotencyKey;
    }

    const updated = await this.paymentModel
      .findOneAndUpdate(
        {
          _id: payment._id,
          status: { $in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING] },
        },
        { $set: setDoc as any },
        { new: true },
      )
      .exec();

    if (!updated) {
      const existing = await this.paymentModel.findById(payment._id).exec();
      if (existing?.status === PaymentStatus.COMPLETED) {
        return;
      }
      throw new HttpException(
        { code: PAYMENT_ERROR.STATUS_TRANSITION, message: 'Invalid payment status for completion' },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (Number(updated.amount || 0) > 0) {
      await this.platformWalletModel.findOneAndUpdate(
        { walletId: PLATFORM_WALLET_ID },
        { $inc: { balancePkr: updated.amount } },
        { upsert: true, new: true },
      );
    }

    if (updated.appointmentId) {
      await this.appointmentModel.updateOne(
        { _id: updated.appointmentId },
        { isPaid: true, paymentId: updated._id },
      );
    }

    const appointmentId = updated.appointmentId?.toString?.();
    await Promise.all([
      this.notificationService.createNotification(
        updated.citizenId!.toString(),
        NotificationType.PAYMENT_SENT,
        'Payment Received',
        'Your consultation payment has been received by LawyersKonnect and is held securely until consultation completion.',
        { paymentId: updated._id.toString(), appointmentId, receiptNumber: updated.receiptNumber },
        '/client/payments',
      ),
      this.notificationService.createNotification(
        updated.lawyerId.toString(),
        NotificationType.PAYMENT_RECEIVED,
        'Client Payment Received',
        `The client payment is received in LawyersKonnect wallet. PKR ${updated.lawyerAmount} will be auto-released after consultation completion.`,
        {
          paymentId: updated._id.toString(),
          appointmentId,
          grossAmount: updated.amount,
          platformFee: updated.platformFee || updated.platformFeeAmount || 0,
          expectedPayout: updated.lawyerAmount,
        },
        '/lawyer/earnings',
      ),
      this.notificationService.notifyAdminsPaymentEvent(
        'Payment Received in App Wallet',
        'A new consultation payment has been received in the LawyersKonnect wallet.',
        { paymentId: updated._id.toString(), appointmentId },
        '/admin/payments',
      ),
    ]);
  }

  private async applyVerifiedFailure(
    payment: PaymentDocument,
    failureReason: string,
    opts?: { providerResponse?: Record<string, any>; idempotencyKey?: string },
    flags?: { allowFromCompleted: boolean },
  ) {
    const allowFromCompleted = flags?.allowFromCompleted ?? false;
    const fresh = await this.paymentModel.findById(payment._id).exec();
    if (!fresh) {
      return;
    }
    if (fresh.status === PaymentStatus.COMPLETED && !allowFromCompleted) {
      return;
    }
    if (fresh.status !== PaymentStatus.PENDING && fresh.status !== PaymentStatus.PROCESSING) {
      return;
    }
    fresh.status = PaymentStatus.FAILED;
    fresh.failureReason = failureReason;
    fresh.providerResponse = {
      ...(fresh.providerResponse || {}),
      ...(opts?.providerResponse || {}),
    };
    if (opts?.idempotencyKey) {
      fresh.idempotencyKey = opts.idempotencyKey;
    }
    fresh.gatewayResponse = { ...(fresh.gatewayResponse || {}), status: 'failed', reason: failureReason, failedAt: new Date() };
    await fresh.save();

    if (fresh.type === PaymentType.SUBSCRIPTION_FEE) {
      await this.lawyerSubscriptionService.markSubscriptionPaymentFailed(fresh, failureReason);
    }
  }

  private sanitizeProviderPayload(payload: Record<string, any>) {
    const hiddenFields = new Set([
      'pp_Password',
      'password',
      'secret',
      'integritySalt',
      'salt',
      'pp_SecureHash',
      'pp_SecureHash2',
      'orderHash',
      'secureHash',
      'hmac',
      'hash',
    ]);
    const out: Record<string, any> = {};
    Object.entries(payload || {}).forEach(([key, value]) => {
      if (hiddenFields.has(key)) {
        out[key] = '[redacted]';
        return;
      }
      if (typeof value === 'string' && value.length > 2000) {
        out[key] = '[truncated]';
        return;
      }
      out[key] = value;
    });
    return out;
  }

  private buildPayoutSnapshot(lawyer: any) {
    const payout = lawyer?.lawyerProfile?.payoutAccount;
    if (!payout?.method || !payout?.accountTitle) return null;
    if (payout.method === 'bank' && !payout.bankName) return null;
    if (payout.method === 'bank' && !payout.accountNumber && !payout.iban) return null;
    if ((payout.method === 'jazzcash' || payout.method === 'easypaisa') && !payout.mobileNumber) return null;
    return {
      method: payout.method,
      accountTitle: payout.accountTitle,
      bankName: payout.bankName,
      maskedAccountNumber: this.maskAccountIdentifier(payout.accountNumber),
      maskedIban: this.maskAccountIdentifier(payout.iban),
      maskedMobileNumber: this.maskAccountIdentifier(payout.mobileNumber),
    };
  }

  async ensurePayoutEligibilityForCompletedAppointment(appointmentId: string) {
    const aid = new Types.ObjectId(appointmentId);
    const appointment = await this.appointmentModel.findById(aid).exec();
    if (!appointment || appointment.status !== 'completed') {
      return { success: true, message: 'Appointment not completed yet' };
    }
    const payment = await this.paymentModel.findOne({
      appointmentId: aid,
      status: PaymentStatus.COMPLETED,
      escrowStatus: EscrowStatus.HELD,
    });
    if (!payment) {
      return { success: true, message: 'No held completed payment found for payout eligibility' };
    }

    const existing = await this.payoutModel.findOne({ paymentId: payment._id }).exec();
    if (existing) {
      if (existing.status === PayoutStatus.PENDING) {
        await this.syncPendingPayoutEligibility(existing);
      }
      const fresh = await this.payoutModel.findById(existing._id).exec();
      if (fresh?.status === PayoutStatus.ELIGIBLE) {
        await this.tryAutoReleasePayout(String(fresh._id));
      }
      const updated = (await this.payoutModel.findById(existing._id).exec()) || existing;
      return { success: true, message: 'Payout already exists', data: updated };
    }

    const lawyer = await this.userModel.findById(payment.lawyerId).exec();
    const snapshot = this.buildPayoutSnapshot(lawyer);
    const payoutStatus = snapshot ? PayoutStatus.ELIGIBLE : PayoutStatus.PENDING;

    const payout = await this.payoutModel.create({
      lawyerId: payment.lawyerId,
      citizenId: payment.citizenId,
      appointmentId: payment.appointmentId,
      paymentId: payment._id,
      grossAmount: payment.amount,
      platformFee: payment.platformFee || payment.platformFeeAmount || 0,
      netAmount: payment.lawyerAmount || 0,
      currency: payment.currency || 'PKR',
      status: payoutStatus,
      payoutMethod: snapshot?.method,
      payoutAccountSnapshot: snapshot,
    });

    payment.payoutId = payout._id as Types.ObjectId;
    payment.escrowStatus = snapshot ? EscrowStatus.ELIGIBLE_FOR_RELEASE : EscrowStatus.HELD;
    await payment.save();

    if (snapshot) {
      const released = await this.tryAutoReleasePayout(String(payout._id));
      if (released) {
        return { success: true, message: 'Payout auto-released', data: released };
      }
      await Promise.all([
        this.notificationService.createNotification(
          payment.lawyerId.toString(),
          NotificationType.PAYMENT_RECEIVED,
          'Consultation Completed - Payout Pending',
          'Consultation completed. Payout could not be auto-released yet — check your payout account or platform wallet balance.',
          { payoutId: payout._id.toString(), paymentId: payment._id.toString() },
          '/lawyer/earnings',
        ),
      ]);
      return { success: true, message: 'Payout created (auto-release pending)', data: payout };
    }

    await Promise.all([
      this.notificationService.createNotification(
        payment.lawyerId.toString(),
        NotificationType.PAYMENT_RECEIVED,
        'Consultation Completed - Payout Pending',
        'Consultation completed. Please add payout account details to receive earnings automatically.',
        { payoutId: payout._id.toString(), paymentId: payment._id.toString() },
        '/lawyer/earnings',
      ),
      this.notificationService.notifyAdminsPaymentEvent(
        'Payout Pending — Missing Lawyer Account',
        'Consultation completed but lawyer payout account is missing. Payout will auto-release when the lawyer saves payout details.',
        { payoutId: payout._id.toString(), paymentId: payment._id.toString() },
        '/admin/payments',
      ),
    ]);

    return { success: true, message: 'Payout created', data: payout };
  }

  /** Auto-release all pending/eligible payouts when lawyer saves payout account. */
  async autoReleasePendingPayoutsForLawyer(lawyerId: string) {
    const lid = new Types.ObjectId(lawyerId);
    const rows = await this.payoutModel
      .find({ lawyerId: lid, status: { $in: [PayoutStatus.PENDING, PayoutStatus.ELIGIBLE] } })
      .exec();
    for (const row of rows) {
      if (row.status === PayoutStatus.PENDING) {
        await this.syncPendingPayoutEligibility(row);
      }
      const fresh = await this.payoutModel.findById(row._id).exec();
      if (fresh?.status === PayoutStatus.ELIGIBLE) {
        await this.tryAutoReleasePayout(String(fresh._id));
      }
    }
    return { success: true, processed: rows.length };
  }

  /** Process every payout that can be auto-released (admin dashboard / earnings refresh). */
  async processAllAutoReleasablePayouts() {
    const eligible = await this.payoutModel.find({ status: PayoutStatus.ELIGIBLE }).exec();
    for (const row of eligible) {
      await this.tryAutoReleasePayout(String(row._id));
    }
    const pending = await this.payoutModel.find({ status: PayoutStatus.PENDING }).exec();
    for (const row of pending) {
      await this.syncPendingPayoutEligibility(row);
      const fresh = await this.payoutModel.findById(row._id).exec();
      if (fresh?.status === PayoutStatus.ELIGIBLE) {
        await this.tryAutoReleasePayout(String(fresh._id));
      }
    }
    return { success: true };
  }

  /** Refresh payout snapshot + escrow flags before auto-release (fixes legacy stuck rows). */
  private async repairPayoutForAutoRelease(payout: PayoutDocument, payment: PaymentDocument, appointment: AppointmentDocument) {
    if (!payout.payoutAccountSnapshot?.method) {
      const lawyer = await this.userModel.findById(payout.lawyerId).exec();
      const snapshot = this.buildPayoutSnapshot(lawyer);
      if (snapshot) {
        payout.payoutMethod = snapshot.method;
        payout.payoutAccountSnapshot = snapshot;
        if (payout.status === PayoutStatus.PENDING) {
          payout.status = PayoutStatus.ELIGIBLE;
        }
        await payout.save();
      }
    }
    if (
      appointment.status === 'completed' &&
      payment.status === PaymentStatus.COMPLETED &&
      (payment.escrowStatus === EscrowStatus.HELD || payment.escrowStatus === EscrowStatus.ELIGIBLE_FOR_RELEASE)
    ) {
      if (payment.escrowStatus === EscrowStatus.HELD && payout.status === PayoutStatus.ELIGIBLE) {
        payment.escrowStatus = EscrowStatus.ELIGIBLE_FOR_RELEASE;
        await payment.save();
      }
    }
  }

  async tryAutoReleasePayout(payoutId: string): Promise<PayoutDocument | null> {
    try {
      const result = await this.releasePayoutInternal(payoutId, { source: 'auto' });
      return result.data;
    } catch (err) {
      this.logger.warn(
        `Auto-release failed for payout ${payoutId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  private async releasePayoutInternal(
    payoutId: string,
    opts?: { releasedBy?: string; externalTransferReference?: string; notes?: string; source?: 'auto' | 'admin' },
  ) {
    const payout = await this.payoutModel.findById(payoutId).exec();
    if (!payout) throw new HttpException('Payout not found', HttpStatus.NOT_FOUND);
    if (payout.status === PayoutStatus.RELEASED) {
      return { success: true, message: 'Payout already released', data: payout };
    }
    if (payout.status !== PayoutStatus.ELIGIBLE) {
      throw new HttpException('Payout is not eligible for release', HttpStatus.BAD_REQUEST);
    }

    const payment = await this.paymentModel.findById(payout.paymentId).exec();
    const appointment = payment?.appointmentId ? await this.appointmentModel.findById(payment.appointmentId).exec() : null;
    if (!payment || !appointment) throw new HttpException('Payment or appointment not found', HttpStatus.NOT_FOUND);
    if (appointment.status !== 'completed') throw new HttpException('Appointment not completed', HttpStatus.BAD_REQUEST);
    if (payment.status !== PaymentStatus.COMPLETED) throw new HttpException('Payment not completed', HttpStatus.BAD_REQUEST);

    if (opts?.source === 'auto') {
      await this.repairPayoutForAutoRelease(payout, payment, appointment);
    }

    const activePayout = (await this.payoutModel.findById(payoutId).exec()) || payout;
    const activePayment = (await this.paymentModel.findById(activePayout.paymentId).exec()) || payment;

    if (!activePayout.payoutAccountSnapshot?.method) {
      throw new HttpException('Lawyer payout account is missing', HttpStatus.BAD_REQUEST);
    }

    const escrowOk =
      activePayment.escrowStatus === EscrowStatus.ELIGIBLE_FOR_RELEASE ||
      (opts?.source === 'auto' &&
        activePayment.escrowStatus === EscrowStatus.HELD &&
        appointment.status === 'completed');
    if (!escrowOk) {
      throw new HttpException('Escrow is not eligible for release', HttpStatus.BAD_REQUEST);
    }

    let wallet = await this.platformWalletModel.findOne({ walletId: PLATFORM_WALLET_ID });
    if (!wallet) wallet = await this.platformWalletModel.create({ walletId: PLATFORM_WALLET_ID, balancePkr: 0 });
    if ((wallet.balancePkr || 0) < (activePayout.netAmount || 0)) {
      throw new HttpException('Platform wallet has insufficient balance', HttpStatus.BAD_REQUEST);
    }
    await this.platformWalletModel.updateOne(
      { walletId: PLATFORM_WALLET_ID },
      { $inc: { balancePkr: -Math.max(0, activePayout.netAmount || 0) } },
    );

    activePayout.status = PayoutStatus.RELEASED;
    activePayout.releasedAt = new Date();
    if (opts?.releasedBy && Types.ObjectId.isValid(opts.releasedBy)) {
      activePayout.releasedBy = new Types.ObjectId(opts.releasedBy);
    }
    activePayout.externalTransferReference =
      opts?.externalTransferReference ||
      activePayout.externalTransferReference ||
      (opts?.source === 'auto' ? `AUTO-${Date.now()}` : undefined);
    activePayout.notes =
      opts?.notes ||
      activePayout.notes ||
      (opts?.source === 'auto' ? 'Auto-released after consultation completion' : undefined);
    await activePayout.save();

    activePayment.escrowStatus = EscrowStatus.RELEASED;
    activePayment.lawyerPayoutReleased = true;
    activePayment.lawyerPayoutReleasedAt = new Date();
    activePayment.payoutReleasedAt = activePayout.releasedAt;
    activePayment.payoutReleasedBy = activePayout.releasedBy;
    await activePayment.save();

    const isAuto = opts?.source === 'auto';
    await Promise.all([
      this.notificationService.createNotification(
        activePayout.lawyerId.toString(),
        NotificationType.PAYMENT_RECEIVED,
        isAuto ? 'Payout Auto-Released' : 'Payout Released',
        isAuto
          ? `Your consultation payout of PKR ${activePayout.netAmount} has been automatically released to your saved payout method.`
          : `Your consultation payout of PKR ${activePayout.netAmount} has been released to your saved payout method.`,
        {
          payoutId: activePayout._id.toString(),
          externalTransferReference: activePayout.externalTransferReference,
          releasedAt: activePayout.releasedAt,
          autoReleased: isAuto,
        },
        '/lawyer/earnings',
      ),
      this.notificationService.notifyAdminsPaymentEvent(
        isAuto ? 'Payout Auto-Released' : 'Payout Marked as Released',
        isAuto
          ? `PKR ${activePayout.netAmount} was auto-released to the lawyer after consultation completion.`
          : 'The payout has been marked as released successfully.',
        { payoutId: activePayout._id.toString(), paymentId: activePayment._id.toString(), autoReleased: isAuto },
        '/admin/payments',
      ),
    ]);

    return { success: true, message: isAuto ? 'Payout auto-released' : 'Payout marked as released', data: activePayout };
  }

  async releasePayoutByAdmin(
    payoutId: string,
    adminId: string,
    payload?: { externalTransferReference?: string; notes?: string },
  ) {
    return this.releasePayoutInternal(payoutId, {
      releasedBy: adminId,
      externalTransferReference: payload?.externalTransferReference,
      notes: payload?.notes,
      source: 'admin',
    });
  }

  async markPayoutFailedByAdmin(payoutId: string, adminId: string, failureReason: string) {
    const payout = await this.payoutModel.findById(payoutId).exec();
    if (!payout) throw new HttpException('Payout not found', HttpStatus.NOT_FOUND);
    if (payout.status === PayoutStatus.RELEASED) {
      throw new HttpException('Released payout cannot be marked failed', HttpStatus.BAD_REQUEST);
    }
    payout.status = PayoutStatus.FAILED;
    payout.failureReason = failureReason || 'Marked failed by admin';
    payout.notes = `Marked by admin ${adminId}`;
    await payout.save();
    return { success: true, message: 'Payout marked failed', data: payout };
  }

  /** Upgrade pending payout to eligible when lawyer has since saved a payout account. */
  private async syncPendingPayoutEligibility(payout: PayoutDocument): Promise<PayoutDocument> {
    if (payout.status !== PayoutStatus.PENDING) return payout;
    const lawyer = await this.userModel.findById(payout.lawyerId).exec();
    const snapshot = this.buildPayoutSnapshot(lawyer);
    if (!snapshot) return payout;

    payout.status = PayoutStatus.ELIGIBLE;
    payout.payoutMethod = snapshot.method;
    payout.payoutAccountSnapshot = snapshot;
    await payout.save();

    const payment = await this.paymentModel.findById(payout.paymentId).exec();
    if (payment && payment.escrowStatus === EscrowStatus.HELD) {
      payment.escrowStatus = EscrowStatus.ELIGIBLE_FOR_RELEASE;
      await payment.save();
    }

    const released = await this.tryAutoReleasePayout(String(payout._id));
    if (released) {
      const updated = await this.payoutModel.findById(payout._id).exec();
      return updated || payout;
    }
    return payout;
  }

  async getAdminPayouts(filters: any, page = 1, limit = 20) {
    await this.processAllAutoReleasablePayouts().catch(() => undefined);
    const query: any = {};
    if (filters?.status) query.status = filters.status;
    if (filters?.lawyerId) query.lawyerId = new Types.ObjectId(filters.lawyerId);
    if (filters?.startDate && filters?.endDate) {
      query.createdAt = { $gte: new Date(filters.startDate), $lte: new Date(filters.endDate) };
    }
    const skip = (page - 1) * limit;
    const [rows, total] = await Promise.all([
      this.payoutModel
        .find(query)
        .populate('lawyerId', 'email lawyerProfile.fullName')
        .populate('citizenId', 'email citizenProfile.fullName')
        .populate('appointmentId', 'appointmentDate startTime status')
        .populate('paymentId', 'referenceNumber amount escrowStatus')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.payoutModel.countDocuments(query),
    ]);
    const data = await Promise.all(
      rows.map(async (p) => {
        if (p.status === PayoutStatus.PENDING) {
          await this.syncPendingPayoutEligibility(p);
        }
        const fresh = await this.payoutModel.findById(p._id).exec();
        if (fresh?.status === PayoutStatus.ELIGIBLE) {
          await this.tryAutoReleasePayout(String(fresh._id));
        }
        return (await this.payoutModel.findById(p._id).exec()) || p;
      }),
    );
    return {
      success: true,
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /** Get platform (admin) wallet balance */
  async getPlatformWalletBalance() {
    await this.processAllAutoReleasablePayouts().catch((err) => {
      this.logger.warn(`Auto-release sweep failed: ${err instanceof Error ? err.message : String(err)}`);
    });
    const wallet = await this.platformWalletModel.findOne({ walletId: PLATFORM_WALLET_ID }, { balancePkr: 1 });
    const completed = await this.paymentModel.aggregate([
      {
        $group: {
          _id: null,
          totalReceived: {
            $sum: { $cond: [{ $eq: ['$status', PaymentStatus.COMPLETED] }, '$amount', 0] },
          },
          escrowHeld: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$status', PaymentStatus.COMPLETED] },
                    { $in: ['$escrowStatus', [EscrowStatus.HELD, EscrowStatus.ELIGIBLE_FOR_RELEASE]] },
                  ],
                },
                '$lawyerAmount',
                0,
              ],
            },
          },
          releasedPayouts: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$status', PaymentStatus.COMPLETED] }, { $eq: ['$escrowStatus', EscrowStatus.RELEASED] }] },
                '$lawyerAmount',
                0,
              ],
            },
          },
          platformRevenue: {
            $sum: { $cond: [{ $eq: ['$status', PaymentStatus.COMPLETED] }, '$platformRevenue', 0] },
          },
          refundedAmount: {
            $sum: { $cond: [{ $eq: ['$status', PaymentStatus.REFUNDED] }, '$amount', 0] },
          },
        },
      },
    ]);
    const eligible = await this.payoutModel.aggregate([
      { $match: { status: PayoutStatus.ELIGIBLE } },
      { $group: { _id: null, eligiblePayouts: { $sum: '$netAmount' } } },
    ]);
    const row = completed[0] || {};
    return {
      success: true,
      data: {
        balancePkr: wallet?.balancePkr ?? 0,
        totalReceived: row.totalReceived || 0,
        escrowHeld: row.escrowHeld || 0,
        eligiblePayouts: eligible[0]?.eligiblePayouts || 0,
        releasedPayouts: row.releasedPayouts || 0,
        platformRevenue: row.platformRevenue || 0,
        refundedAmount: row.refundedAmount || 0,
      },
    };
  }

  // Get payment by ID
  async getPaymentById(paymentId: string, userId: string, role?: string) {
    const pidStr = String(paymentId || '').trim();
    let pid: Types.ObjectId;
    try {
      pid = new Types.ObjectId(pidStr);
    } catch {
      throw new HttpException('Invalid payment id', HttpStatus.BAD_REQUEST);
    }

    const payment = await this.paymentModel
      .findById(pid)
      .populate('citizenId', 'email citizenProfile.fullName')
      .populate('lawyerId', 'email lawyerProfile.fullName')
      .exec();

    if (!payment || !this.userCanAccessPayment(payment, userId, role)) {
      throw new HttpException('Payment not found', HttpStatus.NOT_FOUND);
    }

    return { success: true, data: payment };
  }

  private escapeHtml(value: unknown): string {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private paymentOwnerId(ref: unknown): string {
    if (ref == null) return '';
    if (typeof ref === 'string') return ref.trim();
    if (typeof ref === 'object') {
      const obj = ref as { _id?: unknown; toString?: () => string };
      if (obj._id != null) return String(obj._id);
      if (typeof obj.toString === 'function') {
        const s = obj.toString();
        if (/^[a-f0-9]{24}$/i.test(s)) return s;
      }
    }
    return String(ref);
  }

  private userCanAccessPayment(payment: PaymentDocument, userId: string, role?: string): boolean {
    if (String(role || '').toLowerCase() === 'admin') return true;
    const uid = String(userId || '').trim();
    if (!uid) return false;
    const owners = [
      this.paymentOwnerId(payment.citizenId),
      this.paymentOwnerId(payment.lawyerId),
      this.paymentOwnerId(payment.payerId),
    ];
    return owners.some((id) => id === uid);
  }

  private async loadInvoiceBase(paymentId: string, userId: string, role?: string) {
    const pidStr = String(paymentId || '').trim();
    let pid: Types.ObjectId;
    try {
      pid = new Types.ObjectId(pidStr);
    } catch {
      throw new HttpException('Invalid payment id', HttpStatus.BAD_REQUEST);
    }

    const payment = await this.paymentModel
      .findById(pid)
      .populate('citizenId', 'email citizenProfile.fullName')
      .populate('lawyerId', 'email lawyerProfile.fullName')
      .populate('appointmentId', 'appointmentDate consultationType')
      .exec();

    if (!payment) {
      throw new HttpException('Payment not found', HttpStatus.NOT_FOUND);
    }

    if (!this.userCanAccessPayment(payment, userId, role)) {
      throw new HttpException('Payment not found', HttpStatus.NOT_FOUND);
    }

    const receipt =
      payment.receiptNumber ||
      (payment.type === PaymentType.SUBSCRIPTION_FEE ? `RCP-SUB-${Date.now()}` : `RCP-${Date.now()}`);
    if (!payment.receiptNumber) {
      payment.receiptNumber = receipt;
      await payment.save();
    }

    const now = new Date();
    const citizen: any = payment.citizenId as any;
    const lawyer: any = payment.lawyerId as any;
    const appointment: any = payment.appointmentId as any;
    const createdAt = (payment as any).createdAt as Date | undefined;
    const issueDate = payment.completedAt || payment.paidAt || createdAt || now;

    return {
      payment,
      receipt,
      now,
      citizen,
      lawyer,
      appointment,
      issueDate,
      gross: Number(payment.amount || 0),
      fee: Number(payment.platformFeeAmount || payment.platformFee || 0),
    };
  }

  async getPaymentInvoiceHtml(paymentId: string, userId: string, role: string) {
    const { payment, receipt, now, citizen, lawyer, appointment, issueDate, gross, fee } =
      await this.loadInvoiceBase(paymentId, userId, role);
    const isLawyer = String(role || '').toLowerCase() === 'lawyer';
    const net = Number(payment.lawyerAmount || Math.max(0, gross - fee));

    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Invoice ${this.escapeHtml(receipt)}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 24px; color: #0f172a; }
      .muted { color: #64748b; font-size: 12px; }
      .card { border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-top: 14px; }
      table { width: 100%; border-collapse: collapse; margin-top: 10px; }
      th, td { border-bottom: 1px solid #e2e8f0; padding: 8px; text-align: left; font-size: 14px; }
      th { background: #f8fafc; }
      .right { text-align: right; }
    </style>
  </head>
  <body>
    <h2>LawyersKonnect Payment Invoice</h2>
    <p class="muted">Generated: ${this.escapeHtml(now.toISOString())}</p>
    <div class="card">
      <p><strong>Invoice / Receipt:</strong> ${this.escapeHtml(receipt)}</p>
      <p><strong>Payment Ref:</strong> ${this.escapeHtml(payment.referenceNumber || payment._id.toString())}</p>
      <p><strong>Status:</strong> ${this.escapeHtml(payment.status)}</p>
      <p><strong>Method:</strong> ${this.escapeHtml(payment.method)}</p>
      <p><strong>Date:</strong> ${this.escapeHtml(issueDate.toISOString())}</p>
      <p><strong>Client:</strong> ${this.escapeHtml(citizen?.citizenProfile?.fullName || citizen?.email || '-')}</p>
      <p><strong>Lawyer:</strong> ${this.escapeHtml(lawyer?.lawyerProfile?.fullName || lawyer?.email || '-')}</p>
      <p><strong>Consultation Type:</strong> ${this.escapeHtml(appointment?.consultationType || 'consultation')}</p>
      <p><strong>Appointment Date:</strong> ${this.escapeHtml(
        appointment?.appointmentDate ? new Date(appointment.appointmentDate).toISOString() : '-',
      )}</p>
    </div>
    <table>
      <thead>
        <tr><th>Description</th><th class="right">Amount (PKR)</th></tr>
      </thead>
      <tbody>
        <tr><td>Consultation payment</td><td class="right">${gross.toLocaleString()}</td></tr>
        <tr><td>Platform fee</td><td class="right">${fee.toLocaleString()}</td></tr>
        <tr><td><strong>${isLawyer ? 'Lawyer payout (net)' : 'Total paid'}</strong></td><td class="right"><strong>${(isLawyer ? net : gross).toLocaleString()}</strong></td></tr>
      </tbody>
    </table>
    <p class="muted">This invoice is auto-generated from platform transaction records.</p>
  </body>
</html>`;

    return {
      filename: `invoice-${payment.referenceNumber || payment._id.toString()}.html`,
      html,
      receiptNumber: receipt,
    };
  }

  async getPaymentInvoicePdf(paymentId: string, userId: string, role: string) {
    const { payment, receipt, citizen, lawyer, appointment, issueDate, gross, fee } =
      await this.loadInvoiceBase(paymentId, userId, role);
    const isLawyer = String(role || '').toLowerCase() === 'lawyer';
    const net = Number(payment.lawyerAmount || Math.max(0, gross - fee));

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      doc.on('end', () => resolve());
      doc.on('error', (err) => reject(err));

      doc.fontSize(20).text('LawyersKonnect Payment Invoice', { align: 'left' });
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor('#64748b').text(`Generated: ${new Date().toISOString()}`);
      doc.moveDown(1);

      doc.fillColor('#0f172a').fontSize(12);
      doc.text(`Invoice / Receipt: ${receipt}`);
      doc.text(`Payment Ref: ${payment.referenceNumber || payment._id.toString()}`);
      doc.text(`Status: ${payment.status}`);
      doc.text(`Method: ${payment.method}`);
      doc.text(`Date: ${issueDate.toISOString()}`);
      doc.text(`Client: ${citizen?.citizenProfile?.fullName || citizen?.email || '-'}`);
      doc.text(`Lawyer: ${lawyer?.lawyerProfile?.fullName || lawyer?.email || '-'}`);
      doc.text(`Consultation Type: ${appointment?.consultationType || 'consultation'}`);
      doc.text(
        `Appointment Date: ${appointment?.appointmentDate ? new Date(appointment.appointmentDate).toISOString() : '-'}`,
      );

      doc.moveDown(1.5);
      doc.fontSize(13).text('Amount Breakdown', { underline: true });
      doc.moveDown(0.7);
      doc.fontSize(11);
      doc.text(`Consultation payment: PKR ${gross.toLocaleString()}`);
      doc.text(`Platform fee: PKR ${fee.toLocaleString()}`);
      doc.text(
        `${isLawyer ? 'Lawyer payout (net)' : 'Total paid'}: PKR ${(isLawyer ? net : gross).toLocaleString()}`,
      );

      doc.moveDown(2);
      doc.fontSize(9).fillColor('#64748b').text('This invoice is auto-generated from platform transaction records.');
      doc.end();
    });

    return {
      filename: `invoice-${payment.referenceNumber || payment._id.toString()}.pdf`,
      contentType: 'application/pdf',
      buffer: Buffer.concat(chunks),
      receiptNumber: receipt,
    };
  }

  // Get user's payment history
  async getUserPayments(userId: string, role: string, page = 1, limit = 10) {
    let query: any;
    try {
      const normalizedRole = (role || '').toLowerCase();
      const isLawyer = normalizedRole === 'lawyer';
      const uid = new Types.ObjectId(userId);
      query = isLawyer
        ? { lawyerId: uid, type: PaymentType.CONSULTATION_FEE }
        : { citizenId: uid, type: { $in: [PaymentType.CONSULTATION_FEE, PaymentType.REFUND] } };

      if (isLawyer) {
        await this.autoReleasePendingPayoutsForLawyer(userId).catch((err) => {
          this.logger.warn(
            `Auto-release on earnings fetch failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
      }
    } catch {
      return {
        success: true,
        data: [],
        summary: { totalAmount: 0, totalEarnings: 0, count: 0 },
        pagination: { page, limit, total: 0, totalPages: 0 },
      };
    }
    const skip = (page - 1) * limit;

    const [payments, total] = await Promise.all([
      this.paymentModel
        .find(query)
        .populate('citizenId', 'email citizenProfile.fullName')
        .populate('lawyerId', 'email lawyerProfile.fullName')
        .populate('appointmentId', 'appointmentDate startTime status consultationType')
        .populate('payoutId')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.paymentModel.countDocuments(query),
    ]);

    // Calculate totals (lawyer: only released payouts count as earnings)
    const normalizedRole = (role || '').toLowerCase();
    const isLawyer = normalizedRole === 'lawyer';
    const matchQuery: any = { ...query, status: PaymentStatus.COMPLETED, type: PaymentType.CONSULTATION_FEE };
    if (isLawyer) {
      delete matchQuery.lawyerPayoutReleased;
    }
    const totals = await this.paymentModel.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$amount' },
          totalEarnings: {
            $sum: isLawyer
              ? {
                  $cond: [{ $eq: ['$escrowStatus', EscrowStatus.RELEASED] }, '$lawyerAmount', 0],
                }
              : 0,
          },
          heldInEscrow: {
            $sum: isLawyer
              ? {
                  $cond: [{ $eq: ['$escrowStatus', EscrowStatus.HELD] }, '$lawyerAmount', 0],
                }
              : 0,
          },
          eligiblePayout: {
            $sum: isLawyer
              ? {
                  $cond: [{ $eq: ['$escrowStatus', EscrowStatus.ELIGIBLE_FOR_RELEASE] }, '$lawyerAmount', 0],
                }
              : 0,
          },
          releasedPayout: {
            $sum: isLawyer
              ? {
                  $cond: [{ $eq: ['$escrowStatus', EscrowStatus.RELEASED] }, '$lawyerAmount', 0],
                }
              : 0,
          },
          count: { $sum: 1 },
        },
      },
    ]);

    return {
      success: true,
      data: payments,
      summary: totals[0] || { totalAmount: 0, totalEarnings: 0, count: 0 },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /** Refund when consultation ended without lawyer participation (cron / system). */
  async processAutomaticConsultationRefund(paymentId: string, reason: string) {
    return this.processRefundInternal(paymentId, reason, null);
  }

  // Process refund (admin only)
  async processRefund(paymentId: string, adminId: string, reason: string) {
    return this.processRefundInternal(paymentId, reason, adminId);
  }

  private async processRefundInternal(
    paymentId: string,
    reason: string,
    adminId: string | null,
  ) {
    const payment = await this.paymentModel.findById(paymentId);
    if (!payment) {
      throw new HttpException('Payment not found', HttpStatus.NOT_FOUND);
    }

    if (payment.status !== PaymentStatus.COMPLETED) {
      throw new HttpException('Only completed payments can be refunded', HttpStatus.BAD_REQUEST);
    }

    if (payment.type === PaymentType.SUBSCRIPTION_FEE) {
      throw new BadRequestException('Subscription payments cannot be refunded through consultation refund flow');
    }

    // Create refund record
    const refund = new this.paymentModel({
      citizenId: payment.citizenId,
      lawyerId: payment.lawyerId,
      appointmentId: payment.appointmentId,
      amount: payment.amount,
      method: payment.method,
      status: PaymentStatus.REFUNDED,
      type: PaymentType.REFUND,
      referenceNumber: `REF${Date.now()}`,
      description: `Refund for payment ${payment.referenceNumber}`,
      refundReason: reason,
      refundedBy: adminId ? new Types.ObjectId(adminId) : undefined,
      refundedAt: new Date(),
    });

    await refund.save();

    // Update original payment
    const wasReceivedInWallet = payment.adminWalletStatus === AdminWalletStatus.RECEIVED;
    payment.status = PaymentStatus.REFUNDED;
    payment.refundedAt = new Date();
    payment.refundReason = reason;
    if (adminId) {
      payment.refundedBy = new Types.ObjectId(adminId);
    }
    payment.adminWalletStatus = AdminWalletStatus.REFUNDED;
    payment.escrowStatus = EscrowStatus.REFUNDED;
    await payment.save();

    if ((payment.amount || 0) > 0 && wasReceivedInWallet) {
      await this.platformWalletModel.updateOne(
        { walletId: PLATFORM_WALLET_ID },
        { $inc: { balancePkr: -Math.max(0, payment.amount || 0) } },
      );
    }

    // Update appointment
    if (payment.appointmentId) {
      await this.appointmentModel.updateOne(
        { _id: payment.appointmentId },
        { isPaid: false },
      );
    }

    // Send notifications
    if (payment.citizenId) {
      await this.notificationService.createPaymentNotification(
        payment.citizenId.toString(),
        'refund',
        payment,
      );
    }

    return {
      success: true,
      message: 'Refund processed successfully',
      data: refund,
    };
  }

  // Get all payments (admin)
  async getAllPayments(filters: any, page = 1, limit = 20) {
    const query: any = {};

    if (filters.status) {
      query.status = filters.status;
    }
    if (filters.method) {
      query.method = filters.method;
    }
    if (filters.paymentType) {
      query.type = filters.paymentType;
    }
    if (filters.type) {
      query.type = filters.type;
    }
    if (filters.startDate && filters.endDate) {
      query.createdAt = {
        $gte: new Date(filters.startDate),
        $lte: new Date(filters.endDate),
      };
    }

    const skip = (page - 1) * limit;

    const [payments, total, summary] = await Promise.all([
      this.paymentModel
        .find(query)
        .populate('citizenId', 'email citizenProfile.fullName')
        .populate('lawyerId', 'email lawyerProfile.fullName paymentInfo')
        .populate('appointmentId', 'appointmentDate startTime status')
        .populate('payoutId')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.paymentModel.countDocuments(query),
      this.paymentModel.aggregate([
        { $match: { status: PaymentStatus.COMPLETED } },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$amount' },
            platformEarnings: { $sum: '$platformFeeAmount' },
            lawyerPayouts: { $sum: '$lawyerAmount' },
            totalTransactions: { $sum: 1 },
          },
        },
      ]),
    ]);

    return {
      success: true,
      data: payments,
      summary: summary[0] || { totalRevenue: 0, platformEarnings: 0, lawyerPayouts: 0, totalTransactions: 0 },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

}
