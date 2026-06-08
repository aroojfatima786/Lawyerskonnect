import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import StripeSdk from 'stripe';
import * as crypto from 'crypto';
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
import { PaymentService } from './payment.service';
import { CreateStripeSessionDto } from '../dto/stripe-payment.dto';

@Injectable()
export class StripePaymentService {
  private readonly logger = new Logger(StripePaymentService.name);

  constructor(
    @InjectModel(Payment.name) private paymentModel: Model<PaymentDocument>,
    @InjectModel(Appointment.name) private appointmentModel: Model<AppointmentDocument>,
    private paymentService: PaymentService,
  ) {}

  isStripeConfigured(): boolean {
    return Boolean((process.env.STRIPE_SECRET_KEY || '').trim());
  }

  private getStripeClient() {
    const secretKey = (process.env.STRIPE_SECRET_KEY || '').trim();
    if (!secretKey) {
      throw new ServiceUnavailableException('Stripe is not configured on the server');
    }
    return new StripeSdk(secretKey);
  }

  private resolveFrontendBase(): string {
    const fe = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
    const isProd = process.env.NODE_ENV === 'production';
    if (isProd) {
      if (!fe) {
        throw new HttpException(
          'FRONTEND_URL is required in production for Stripe redirects',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
      return fe;
    }
    return fe || 'http://localhost:5173';
  }

  async createCheckoutSession(authUserId: string, dto: CreateStripeSessionDto) {
    if (!this.isStripeConfigured()) {
      throw new ServiceUnavailableException('Stripe is not configured on the server');
    }

    if (authUserId !== dto.userId) {
      throw new HttpException('Forbidden resource', HttpStatus.FORBIDDEN);
    }

    if (dto.checkoutType === 'subscription') {
      return this.createSubscriptionCheckoutSession(dto);
    }
    if (dto.checkoutType === 'registration') {
      return this.createRegistrationCheckoutSession(dto);
    }
    return this.createAppointmentCheckoutSession(dto);
  }

  /** Public registration checkout (no JWT) — validated by userId + payment record. */
  async createRegistrationCheckoutSession(dto: CreateStripeSessionDto) {
    return this.createRegistrationCheckoutSessionInternal(dto);
  }

  private async createAppointmentCheckoutSession(dto: CreateStripeSessionDto) {
    let cid: Types.ObjectId;
    let aid: Types.ObjectId;
    try {
      cid = new Types.ObjectId(dto.userId);
      aid = new Types.ObjectId(dto.orderId);
    } catch {
      throw new BadRequestException('Invalid userId or orderId');
    }

    const appointment = await this.appointmentModel
      .findOne({ _id: aid, citizenId: cid })
      .exec();

    if (!appointment) {
      throw new HttpException('Appointment not found', HttpStatus.NOT_FOUND);
    }

    if (appointment.status !== 'confirmed') {
      throw new BadRequestException(
        'Payment is only available after the lawyer confirms your appointment',
      );
    }

    if (appointment.isPaid) {
      throw new BadRequestException('This appointment is already paid');
    }

    const consultationFee = Number(appointment.fee || 0);
    const fee = this.paymentService.computeFeeBreakdownForAmount(consultationFee);
    const totalPayable = fee.grossAmount;
    if (Math.abs(Number(dto.amount) - totalPayable) > 0.001) {
      throw new BadRequestException('Amount does not match total payable (consultation + platform fee)');
    }

    const currency = (dto.currency || 'PKR').trim().toUpperCase();
    if (currency !== 'PKR') {
      throw new BadRequestException('Only PKR is supported for Stripe checkout in this app');
    }

    if (totalPayable <= 0) {
      throw new BadRequestException('Stripe checkout requires a positive amount');
    }

    const existingPending = await this.paymentModel.findOne({
      appointmentId: aid,
      status: PaymentStatus.PENDING,
    });

    if (existingPending && !existingPending.stripeSessionId) {
      throw new HttpException(
        'A payment is already in progress for this appointment',
        HttpStatus.BAD_REQUEST,
      );
    }

    const referenceNumber =
      existingPending?.referenceNumber ||
      `LK${Date.now()}-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;

    const walletMethod =
      dto.walletMethod === 'easypaisa' ? PaymentMethod.EASYPAISA : PaymentMethod.JAZZCASH;
    const walletLabel = dto.walletMethod === 'easypaisa' ? 'EasyPaisa' : 'JazzCash';

    let payment: PaymentDocument;
    if (existingPending?.stripeSessionId) {
      payment = existingPending;
      payment.method = PaymentMethod.CARD;
      payment.provider = 'card';
      if (dto.walletMethod) {
        payment.citizenPaymentMethod = {
          type: 'card',
          accountLabel: `Stripe (${walletLabel} label)`,
        };
      }
    } else {
      payment = await this.paymentModel.create({
        citizenId: cid,
        lawyerId: appointment.lawyerId,
        appointmentId: appointment._id,
        amount: totalPayable,
        currency,
        method: PaymentMethod.CARD,
        provider: 'card',
        status: PaymentStatus.PENDING,
        type: PaymentType.CONSULTATION_FEE,
        referenceNumber,
        platformFeePercent: fee.platformFeePercent,
        platformFeeAmount: fee.platformFee,
        platformFee: fee.platformFee,
        lawyerAmount: fee.lawyerAmount,
        platformRevenue: fee.platformRevenue,
        adminWalletStatus: AdminWalletStatus.NOT_RECEIVED,
        escrowStatus: EscrowStatus.NOT_APPLICABLE,
        citizenPaymentMethod: {
          type: 'card',
          accountLabel: `Stripe (${walletLabel} label)`,
        },
        gatewayResponse: { stripe: true, checkoutMethod: dto.walletMethod || 'jazzcash' },
      });
    }

    const frontendBase = this.resolveFrontendBase();
    const stripe = this.getStripeClient();
    const unitAmount = Math.round(totalPayable * 100);

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: currency.toLowerCase(),
            product_data: {
              name: `LawyersKonnect — ${walletLabel}`,
              description: `Consultation PKR ${consultationFee} + platform fee via ${walletLabel}`,
            },
            unit_amount: unitAmount,
          },
          quantity: 1,
        },
      ],
      metadata: {
        paymentId: payment._id.toString(),
        orderId: dto.orderId,
        userId: dto.userId,
        referenceNumber,
        method: dto.walletMethod || 'jazzcash',
      },
      client_reference_id: payment._id.toString(),
      success_url: `${frontendBase}/client/payments/checkout/${dto.orderId}?stripe=success`,
      cancel_url: `${frontendBase}/client/payments/checkout/${dto.orderId}?stripe=cancel`,
    });

    payment.stripeSessionId = session.id;
    payment.providerReference = referenceNumber;
    payment.gatewayResponse = {
      ...(payment.gatewayResponse || {}),
      stripe: true,
      stripeSessionId: session.id,
      stripeSessionStatus: session.status,
    };
    await payment.save();

    if (!session.url) {
      throw new HttpException('Stripe session URL missing', HttpStatus.BAD_GATEWAY);
    }

    return {
      success: true,
      sessionUrl: session.url,
      sessionId: session.id,
      paymentId: payment._id.toString(),
    };
  }

  private async createRegistrationCheckoutSessionInternal(dto: CreateStripeSessionDto) {
    let pid: Types.ObjectId;
    let uid: Types.ObjectId;
    try {
      pid = new Types.ObjectId(dto.orderId);
      uid = new Types.ObjectId(dto.userId);
    } catch {
      throw new BadRequestException('Invalid userId or payment id');
    }

    const payment = await this.paymentModel.findById(pid).exec();
    if (!payment || payment.type !== PaymentType.LAWYER_REGISTRATION_FEE) {
      throw new HttpException('Registration payment not found', HttpStatus.NOT_FOUND);
    }
    if (payment.payerId?.toString() !== uid.toString()) {
      throw new HttpException('Forbidden resource', HttpStatus.FORBIDDEN);
    }
    if (payment.status !== PaymentStatus.PENDING) {
      throw new BadRequestException('This registration payment is not pending');
    }

    const expectedAmount = Number(payment.amount || 0);
    if (Math.abs(Number(dto.amount) - expectedAmount) > 0.001) {
      throw new BadRequestException('Amount does not match registration fee');
    }

    const currency = (dto.currency || 'PKR').trim().toUpperCase();
    if (currency !== 'PKR') {
      throw new BadRequestException('Only PKR is supported for Stripe checkout in this app');
    }
    if (expectedAmount <= 0) {
      throw new BadRequestException('Stripe checkout requires a positive amount');
    }

    const walletMethod =
      dto.walletMethod === 'easypaisa' ? PaymentMethod.EASYPAISA : PaymentMethod.JAZZCASH;
    const walletLabel = dto.walletMethod === 'easypaisa' ? 'EasyPaisa' : 'JazzCash';
    const referenceNumber = payment.referenceNumber || `LKREG${Date.now()}`;

    payment.method = walletMethod;
    payment.citizenPaymentMethod = {
      type: dto.walletMethod === 'easypaisa' ? 'easypaisa' : 'jazzcash',
      accountLabel: walletLabel,
    };
    payment.gatewayResponse = {
      ...(payment.gatewayResponse || {}),
      stripe: true,
      checkoutType: 'registration',
      checkoutMethod: dto.walletMethod || 'jazzcash',
    };

    const frontendBase = this.resolveFrontendBase();
    const stripe = this.getStripeClient();
    const unitAmount = Math.round(expectedAmount * 100);

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: currency.toLowerCase(),
            product_data: {
              name: `LawyersKonnect — Lawyer registration`,
              description: `Lawyer registration fee via ${walletLabel} (Stripe test)`,
            },
            unit_amount: unitAmount,
          },
          quantity: 1,
        },
      ],
      metadata: {
        paymentId: payment._id.toString(),
        orderId: dto.orderId,
        userId: dto.userId,
        referenceNumber,
        walletMethod: dto.walletMethod || 'jazzcash',
        checkoutType: 'registration',
      },
      client_reference_id: payment._id.toString(),
      success_url: `${frontendBase}/auth/lawyer/registration-payment?stripe=success&userId=${encodeURIComponent(dto.userId)}`,
      cancel_url: `${frontendBase}/auth/lawyer/registration-payment?stripe=cancel&userId=${encodeURIComponent(dto.userId)}`,
    });

    payment.stripeSessionId = session.id;
    payment.providerReference = referenceNumber;
    payment.gatewayResponse = {
      ...(payment.gatewayResponse || {}),
      stripe: true,
      stripeSessionId: session.id,
      stripeSessionStatus: session.status,
      checkoutType: 'registration',
    };
    await payment.save();

    if (!session.url) {
      throw new HttpException('Stripe session URL missing', HttpStatus.BAD_GATEWAY);
    }

    return {
      success: true,
      sessionUrl: session.url,
      sessionId: session.id,
      paymentId: payment._id.toString(),
    };
  }

  private async createSubscriptionCheckoutSession(dto: CreateStripeSessionDto) {
    let pid: Types.ObjectId;
    let uid: Types.ObjectId;
    try {
      pid = new Types.ObjectId(dto.orderId);
      uid = new Types.ObjectId(dto.userId);
    } catch {
      throw new BadRequestException('Invalid userId or payment id');
    }

    const payment = await this.paymentModel.findById(pid).exec();
    if (!payment || payment.type !== PaymentType.SUBSCRIPTION_FEE) {
      throw new HttpException('Subscription payment not found', HttpStatus.NOT_FOUND);
    }
    if (payment.payerId?.toString() !== uid.toString()) {
      throw new HttpException('Forbidden resource', HttpStatus.FORBIDDEN);
    }
    if (payment.status !== PaymentStatus.PENDING) {
      throw new BadRequestException('This subscription payment is not pending');
    }

    const expectedAmount = Number(payment.amount || 0);
    if (Math.abs(Number(dto.amount) - expectedAmount) > 0.001) {
      throw new BadRequestException('Amount does not match subscription fee');
    }

    const currency = (dto.currency || 'PKR').trim().toUpperCase();
    if (currency !== 'PKR') {
      throw new BadRequestException('Only PKR is supported for Stripe checkout in this app');
    }
    if (expectedAmount <= 0) {
      throw new BadRequestException('Stripe checkout requires a positive amount');
    }

    const walletMethod =
      dto.walletMethod === 'easypaisa' ? PaymentMethod.EASYPAISA : PaymentMethod.JAZZCASH;
    const walletLabel = dto.walletMethod === 'easypaisa' ? 'EasyPaisa' : 'JazzCash';
    const referenceNumber = payment.referenceNumber || `LKSUB${Date.now()}`;

    payment.method = walletMethod;
    payment.citizenPaymentMethod = {
      type: dto.walletMethod === 'easypaisa' ? 'easypaisa' : 'jazzcash',
      accountLabel: walletLabel,
    };
    payment.gatewayResponse = {
      ...(payment.gatewayResponse || {}),
      stripe: true,
      checkoutType: 'subscription',
      checkoutMethod: dto.walletMethod || 'jazzcash',
    };

    const frontendBase = this.resolveFrontendBase();
    const stripe = this.getStripeClient();
    const unitAmount = Math.round(expectedAmount * 100);
    const planLabel = payment.planCode ? String(payment.planCode) : 'subscription';

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: currency.toLowerCase(),
            product_data: {
              name: `LawyersKonnect — ${walletLabel} (${planLabel})`,
              description: `Lawyer subscription via ${walletLabel}`,
            },
            unit_amount: unitAmount,
          },
          quantity: 1,
        },
      ],
      metadata: {
        paymentId: payment._id.toString(),
        orderId: dto.orderId,
        userId: dto.userId,
        referenceNumber,
        walletMethod: dto.walletMethod || 'jazzcash',
        checkoutType: 'subscription',
      },
      client_reference_id: payment._id.toString(),
      success_url: `${frontendBase}/lawyer/subscription?stripe=success`,
      cancel_url: `${frontendBase}/lawyer/subscription?stripe=cancel`,
    });

    payment.stripeSessionId = session.id;
    payment.providerReference = referenceNumber;
    payment.gatewayResponse = {
      ...(payment.gatewayResponse || {}),
      stripe: true,
      stripeSessionId: session.id,
      stripeSessionStatus: session.status,
      checkoutType: 'subscription',
    };
    await payment.save();

    if (!session.url) {
      throw new HttpException('Stripe session URL missing', HttpStatus.BAD_GATEWAY);
    }

    return {
      success: true,
      sessionUrl: session.url,
      sessionId: session.id,
      paymentId: payment._id.toString(),
    };
  }

  async handleWebhook(rawBody: Buffer, signature: string | undefined) {
    if (!this.isStripeConfigured()) {
      throw new ServiceUnavailableException('Stripe is not configured on the server');
    }

    const webhookSecret = (process.env.STRIPE_WEBHOOK_SECRET || '').trim();
    if (!webhookSecret) {
      this.logger.error('STRIPE_WEBHOOK_SECRET is missing or empty');
      throw new ServiceUnavailableException('Stripe webhook secret is not configured');
    }

    this.logger.log(
      `Webhook secret loaded prefix=${webhookSecret.slice(0, 8)}… length=${webhookSecret.length}`,
    );

    if (!signature) {
      this.logger.warn('Stripe webhook missing stripe-signature header');
      throw new BadRequestException({
        message: 'Missing Stripe signature header',
        reason: 'missing_stripe_signature',
      });
    }

    this.logger.log(`stripe-signature header present length=${signature.length}`);

    const stripe = this.getStripeClient();
    let event: { type: string; id: string; data: { object: Record<string, any> } };
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret) as typeof event;
    } catch (err: any) {
      const reason = err?.message || String(err);
      this.logger.warn(`Stripe webhook signature verification failed: ${reason}`);
      throw new BadRequestException({
        message: 'Invalid Stripe webhook signature',
        reason: 'signature_verification_failed',
        detail: reason,
        hint:
          'For local dev, run `stripe listen --forward-to localhost:3000/payment/stripe/webhook` and set STRIPE_WEBHOOK_SECRET to the whsec_ value printed by the CLI (not the Dashboard secret).',
      });
    }

    this.logger.log(`Stripe webhook event verified type=${event.type} id=${event.id}`);

    if (event.type !== 'checkout.session.completed') {
      return { received: true, ignored: true, type: event.type };
    }

    const session = event.data.object;
    const paymentId = session.metadata?.paymentId || session.client_reference_id;
    if (!paymentId) {
      this.logger.warn('Stripe checkout.session.completed without paymentId metadata');
      return { received: true, ignored: true, reason: 'missing_payment_id' };
    }

    let payment = await this.paymentModel.findById(paymentId).exec();
    if (!payment && session.id) {
      payment = await this.paymentModel.findOne({ stripeSessionId: session.id }).exec();
    }

    if (!payment) {
      this.logger.warn(`Stripe webhook: payment not found for id ${paymentId}`);
      return { received: true, ignored: true, reason: 'payment_not_found' };
    }

    if (payment.status === PaymentStatus.COMPLETED) {
      if (payment.type === PaymentType.LAWYER_REGISTRATION_FEE) {
        await this.paymentService.markPaymentCompletedFromProvider(
          payment,
          {
            providerTransactionId: payment.providerTransactionId || payment.transactionId,
            providerReference: payment.providerReference || payment.referenceNumber,
            idempotencyKey: `stripe:reconcile:${event.id}`,
          },
          { source: 'stripe_webhook_reconcile' },
        );
      }
      return { received: true, alreadyCompleted: true, paymentId: payment._id.toString() };
    }

    const providerTransactionId =
      (typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id) ||
      String(session.id || '');

    await this.paymentService.markPaymentCompletedFromProvider(
      payment,
      {
        providerTransactionId,
        providerReference: session.metadata?.referenceNumber || payment.referenceNumber,
        providerResponse: {
          stripeEventId: event.id,
          stripeSessionId: session.id,
          stripePaymentStatus: session.payment_status,
        },
        idempotencyKey: `stripe:${event.id}`,
      },
      { source: 'stripe_webhook' },
    );

    return { received: true, completed: true, paymentId: payment._id.toString() };
  }

  /** After Stripe redirect — complete registration when webhook has not run yet (local dev). */
  async syncRegistrationPaymentAfterStripeReturn(userId: string): Promise<{
    synced: boolean;
    completed: boolean;
    reason?: string;
  }> {
    let uid: Types.ObjectId;
    try {
      uid = new Types.ObjectId(userId);
    } catch {
      throw new BadRequestException('Invalid userId');
    }

    if (!this.isStripeConfigured()) {
      return { synced: false, completed: false, reason: 'stripe_not_configured' };
    }

    const pending = await this.paymentModel
      .findOne({
        payerId: uid,
        type: PaymentType.LAWYER_REGISTRATION_FEE,
        status: PaymentStatus.PENDING,
        stripeSessionId: { $exists: true, $ne: null },
      })
      .sort({ createdAt: -1 })
      .exec();

    if (!pending?.stripeSessionId) {
      return { synced: false, completed: false, reason: 'no_pending_stripe_session' };
    }

    const stripe = this.getStripeClient();
    const session = await stripe.checkout.sessions.retrieve(pending.stripeSessionId);

    if (session.payment_status !== 'paid' || session.status !== 'complete') {
      return {
        synced: true,
        completed: false,
        reason: `stripe_session_${session.payment_status || session.status}`,
      };
    }

    const providerTransactionId =
      (typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id) || String(session.id || '');

    await this.paymentService.markPaymentCompletedFromProvider(
      pending,
      {
        providerTransactionId,
        providerReference: session.metadata?.referenceNumber || pending.referenceNumber,
        providerResponse: {
          stripeSessionId: session.id,
          stripePaymentStatus: session.payment_status,
          syncedFromReturn: true,
        },
        idempotencyKey: `stripe:return:${session.id}`,
      },
      { source: 'stripe_return_sync' },
    );

    return { synced: true, completed: true };
  }

  /**
   * After Stripe redirect for consultation — complete payment when webhook has not run yet (local dev).
   */
  async syncConsultationPaymentAfterStripeReturn(
    userId: string,
    opts: { appointmentId?: string; paymentId?: string } = {},
  ): Promise<{
    synced: boolean;
    completed: boolean;
    reason?: string;
    paymentId?: string;
  }> {
    let uid: Types.ObjectId;
    try {
      uid = new Types.ObjectId(userId);
    } catch {
      throw new BadRequestException('Invalid userId');
    }

    if (!this.isStripeConfigured()) {
      return { synced: false, completed: false, reason: 'stripe_not_configured' };
    }

    const query: Record<string, unknown> = {
      citizenId: uid,
      type: PaymentType.CONSULTATION_FEE,
      status: PaymentStatus.PENDING,
      stripeSessionId: { $exists: true, $ne: null },
    };

    if (opts.paymentId) {
      try {
        query._id = new Types.ObjectId(opts.paymentId);
      } catch {
        throw new BadRequestException('Invalid paymentId');
      }
    } else if (opts.appointmentId) {
      try {
        query.appointmentId = new Types.ObjectId(opts.appointmentId);
      } catch {
        throw new BadRequestException('Invalid appointmentId');
      }
    }

    const pending = await this.paymentModel.findOne(query).sort({ createdAt: -1 }).exec();

    if (!pending?.stripeSessionId) {
      return { synced: false, completed: false, reason: 'no_pending_stripe_session' };
    }

    const stripe = this.getStripeClient();
    const session = await stripe.checkout.sessions.retrieve(pending.stripeSessionId);

    if (session.payment_status !== 'paid' || session.status !== 'complete') {
      return {
        synced: true,
        completed: false,
        reason: `stripe_session_${session.payment_status || session.status}`,
        paymentId: pending._id.toString(),
      };
    }

    const providerTransactionId =
      (typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id) || String(session.id || '');

    await this.paymentService.markPaymentCompletedFromProvider(
      pending,
      {
        providerTransactionId,
        providerReference: session.metadata?.referenceNumber || pending.referenceNumber,
        providerResponse: {
          stripeSessionId: session.id,
          stripePaymentStatus: session.payment_status,
          syncedFromReturn: true,
        },
        idempotencyKey: `stripe:return:${session.id}`,
      },
      { source: 'stripe_return_sync' },
    );

    return { synced: true, completed: true, paymentId: pending._id.toString() };
  }
}
