import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as crypto from 'crypto';
import {
  LawyerSubscription,
  LawyerSubscriptionDocument,
  LawyerSubscriptionStatus,
} from '../schemas/lawyer-subscription.schema';
import {
  Payment,
  PaymentDocument,
  PaymentMethod,
  PaymentPayerRole,
  PaymentStatus,
  PaymentType,
  EscrowStatus,
  AdminWalletStatus,
} from '../schemas/payment.schema';
import { User, UserDocument, UserRole, VerificationStatus } from '../schemas/user.schema';
import { PlatformWallet, PlatformWalletDocument } from '../schemas/platform-wallet.schema';
import { AppointmentDocument } from '../schemas/appointment.schema';
import { NotificationType } from '../schemas/notification.schema';
import { NotificationService } from './notification.service';
import { PaymentProviderFactory } from '../payments/payment-provider.factory';
import { PaymentProvider, SupportedPaymentProvider } from '../payments/providers/payment-provider.interface';
import {
  getActivePlansForCatalog,
  getPlanPrice,
  getSubscriptionPlan,
  SubscriptionBillingCycle,
  SubscriptionPlanCode,
} from '../config/subscription-plans';

const PLATFORM_WALLET_ID = 'platform';

@Injectable()
export class LawyerSubscriptionService {
  private readonly logger = new Logger(LawyerSubscriptionService.name);
  private readonly paymentProviderName: SupportedPaymentProvider;
  private readonly paymentProvider: PaymentProvider;

  constructor(
    @InjectModel(LawyerSubscription.name)
    private subscriptionModel: Model<LawyerSubscriptionDocument>,
    @InjectModel(Payment.name) private paymentModel: Model<PaymentDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(PlatformWallet.name) private platformWalletModel: Model<PlatformWalletDocument>,
    private notificationService: NotificationService,
  ) {
    this.paymentProviderName = PaymentProviderFactory.resolveProviderNameFromEnv();
    this.paymentProvider = PaymentProviderFactory.create(this.paymentProviderName);
  }

  getPlansCatalog(billingCycle?: SubscriptionBillingCycle) {
    const cycle = billingCycle === 'yearly' ? 'yearly' : 'monthly';
    return {
      success: true,
      data: getActivePlansForCatalog(cycle),
    };
  }

  async getMySubscription(lawyerId: string) {
    const lawyer = await this.userModel.findById(lawyerId).exec();
    if (!lawyer || lawyer.role !== UserRole.LAWYER) {
      throw new ForbiddenException('Lawyer account required');
    }

    const active = await this.findEffectiveActiveSubscription(lawyerId);
    const profile = lawyer.lawyerProfile;
    const effectivePlan = this.resolveEffectivePlanCode(active, profile);
    const plan = getSubscriptionPlan(effectivePlan) || getSubscriptionPlan('free')!;

    let remainingDays: number | null = null;
    if (active?.currentPeriodEnd && active.status === LawyerSubscriptionStatus.ACTIVE) {
      const ms = active.currentPeriodEnd.getTime() - Date.now();
      remainingDays = Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
    }

    return {
      success: true,
      data: {
        subscription: active,
        effectivePlan: plan,
        effectivePlanCode: effectivePlan,
        subscriptionTier: profile?.subscriptionTier || 'free',
        subscriptionBadge: profile?.subscriptionBadge || null,
        subscriptionExpiresAt: profile?.subscriptionExpiresAt || active?.currentPeriodEnd || null,
        remainingDays,
        autoRenew: active?.autoRenew ?? false,
        cancelAtPeriodEnd: active?.cancelAtPeriodEnd ?? false,
      },
    };
  }

  async checkout(
    lawyerId: string,
    body: {
      planCode: 'professional' | 'premium';
      billingCycle: SubscriptionBillingCycle;
      method: PaymentMethod;
      accountIdentifier?: string;
      stripeCheckout?: boolean;
    },
  ) {
    const plan = getSubscriptionPlan(body.planCode);
    if (!plan) {
      throw new BadRequestException('Invalid plan. Free plan does not require checkout.');
    }

    const amount = getPlanPrice(body.planCode, body.billingCycle);
    if (amount <= 0) {
      throw new BadRequestException('Invalid plan price');
    }

    const lawyer = await this.userModel.findById(lawyerId).exec();
    if (!lawyer || lawyer.role !== UserRole.LAWYER) {
      throw new ForbiddenException('Lawyer account required');
    }

    if (lawyer.lawyerProfile?.verificationStatus !== VerificationStatus.VERIFIED) {
      throw new ForbiddenException(
        'Your lawyer account must be verified before subscribing to a paid plan.',
      );
    }

    const normalizedMethod =
      body.method === PaymentMethod.BANK_TRANSFER ? PaymentMethod.MANUAL : body.method;
    if (!body.stripeCheckout) {
      this.assertProviderMethodMatch(normalizedMethod);
    }

    const pendingExisting = await this.subscriptionModel.findOne({
      lawyerId: new Types.ObjectId(lawyerId),
      status: LawyerSubscriptionStatus.PENDING_PAYMENT,
    });
    if (pendingExisting) {
      await this.subscriptionModel.updateOne(
        { _id: pendingExisting._id },
        { $set: { status: LawyerSubscriptionStatus.FAILED } },
      );
    }

    const subscription = await this.subscriptionModel.create({
      lawyerId: new Types.ObjectId(lawyerId),
      planCode: body.planCode,
      status: LawyerSubscriptionStatus.PENDING_PAYMENT,
      billingCycle: body.billingCycle,
      autoRenew: false,
    });

    const referenceNumber = `LKSUB${Date.now()}-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;

    const payment = new this.paymentModel({
      type: PaymentType.SUBSCRIPTION_FEE,
      payerId: new Types.ObjectId(lawyerId),
      payerRole: PaymentPayerRole.LAWYER,
      lawyerId: new Types.ObjectId(lawyerId),
      subscriptionId: subscription._id,
      planCode: body.planCode,
      billingCycle: body.billingCycle,
      amount,
      method: normalizedMethod,
      status: PaymentStatus.PENDING,
      referenceNumber,
      provider: this.paymentProviderName,
      escrowStatus: EscrowStatus.NOT_APPLICABLE,
      adminWalletStatus: AdminWalletStatus.NOT_RECEIVED,
      platformFeePercent: 0,
      platformFeeAmount: 0,
      platformFee: 0,
      lawyerAmount: 0,
      platformRevenue: amount,
      description: `Lawyer subscription: ${plan.name} (${body.billingCycle})`,
      providerEnv:
        this.paymentProviderName === 'manual'
          ? 'manual'
          : (process.env.JAZZCASH_ENV || process.env.EASYPAISA_ENV || 'sandbox').toLowerCase(),
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
              : 'Manual',
      },
    });

    const stubAppointment = { _id: subscription._id } as AppointmentDocument;

    if (body.stripeCheckout) {
      payment.provider = 'manual';
      payment.providerReference = referenceNumber;
      payment.gatewayResponse = {
        stripe: true,
        checkoutType: 'subscription',
        checkoutMethod: normalizedMethod,
      };
      await payment.save();

      await this.subscriptionModel.updateOne(
        { _id: subscription._id },
        { $set: { lastPaymentId: payment._id } },
      );

      return {
        success: true,
        message: 'Subscription checkout prepared for Stripe',
        data: {
          subscriptionId: subscription._id.toString(),
          paymentId: payment._id.toString(),
          referenceNumber,
          amount,
          planCode: body.planCode,
          billingCycle: body.billingCycle,
          method: normalizedMethod,
          provider: 'manual',
          providerReference: referenceNumber,
          gatewayInfo: null,
          checkoutUrl: null,
          redirectFormPayload: null,
        },
      };
    }

    const intent = await this.paymentProvider.createPaymentIntent(
      payment,
      stubAppointment,
      lawyer,
      body.accountIdentifier,
    );

    payment.providerReference = intent.providerReference || referenceNumber;
    payment.providerResponse = intent.providerResponse || {};
    await payment.save();

    await this.subscriptionModel.updateOne(
      { _id: subscription._id },
      { $set: { lastPaymentId: payment._id } },
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

    return {
      success: true,
      message: 'Subscription checkout initiated',
      data: {
        subscriptionId: subscription._id.toString(),
        paymentId: payment._id.toString(),
        referenceNumber,
        amount,
        planCode: body.planCode,
        billingCycle: body.billingCycle,
        method: normalizedMethod,
        provider: this.paymentProviderName,
        providerReference: payment.providerReference,
        gatewayInfo:
          this.paymentProviderName === 'manual'
            ? { ...(intent.gatewayInfo || {}), receivingWallet: manualWalletInfo }
            : intent.gatewayInfo || null,
        checkoutUrl: intent.checkoutUrl,
        redirectFormPayload: intent.redirectFormPayload,
      },
    };
  }

  async confirmSubscriptionPayment(
    paymentId: string,
    lawyerId: string,
    transactionId?: string,
    failure?: { code: 'declined' | 'gateway_unavailable'; reason?: string },
  ) {
    const payment = await this.paymentModel.findById(paymentId).exec();
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }
    if (payment.type !== PaymentType.SUBSCRIPTION_FEE) {
      throw new BadRequestException('Not a subscription payment');
    }
    if (payment.payerId?.toString() !== lawyerId) {
      throw new ForbiddenException('Forbidden');
    }
    if ((payment.provider || this.paymentProviderName) !== 'manual') {
      throw new BadRequestException('Manual confirmation is only available for manual provider');
    }
    if (payment.status !== PaymentStatus.PENDING) {
      throw new BadRequestException('Payment cannot be confirmed');
    }

    if (failure?.code) {
      payment.status = PaymentStatus.FAILED;
      payment.failureReason = failure.reason || failure.code;
      await payment.save();
      if (payment.subscriptionId) {
        await this.subscriptionModel.updateOne(
          { _id: payment.subscriptionId },
          { $set: { status: LawyerSubscriptionStatus.FAILED } },
        );
      }
      await this.notificationService.createNotification(
        lawyerId,
        NotificationType.SUBSCRIPTION_PAYMENT_FAILED,
        'Subscription payment failed',
        failure.reason || 'Your subscription payment could not be completed.',
        { paymentId: payment._id.toString() },
        '/lawyer/subscription',
      );
      throw new BadRequestException('Payment declined');
    }

    await this.activateFromPayment(payment, {
      providerTransactionId: transactionId || `TXN${Date.now()}`,
      providerReference: payment.providerReference || payment.referenceNumber,
      idempotencyKey: payment.referenceNumber,
      source: 'manual_confirm',
    });

    const fresh = await this.paymentModel.findById(paymentId).exec();
    return { success: true, message: 'Subscription payment confirmed', data: fresh };
  }

  async cancelSubscription(lawyerId: string) {
    const active = await this.findEffectiveActiveSubscription(lawyerId);
    if (!active || active.planCode === 'free') {
      return { success: true, message: 'No paid subscription to cancel' };
    }

    active.cancelAtPeriodEnd = true;
    active.cancelledAt = new Date();
    active.autoRenew = false;
    await active.save();

    await this.notificationService.createNotification(
      lawyerId,
      NotificationType.SUBSCRIPTION_CANCELLED,
      'Subscription cancellation scheduled',
      'Your paid plan will remain active until the end of the current billing period, then revert to Free.',
      { subscriptionId: active._id.toString() },
      '/lawyer/subscription',
    );

    return { success: true, message: 'Subscription will end at period close', data: active };
  }

  async getSubscriptionPayments(lawyerId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const query = {
      type: PaymentType.SUBSCRIPTION_FEE,
      payerId: new Types.ObjectId(lawyerId),
    };
    const [data, total] = await Promise.all([
      this.paymentModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      this.paymentModel.countDocuments(query),
    ]);
    return {
      success: true,
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 0 },
    };
  }

  /** Called from PaymentService gateway success path. */
  async activateFromPayment(
    payment: PaymentDocument,
    opts: {
      providerTransactionId?: string;
      providerReference?: string;
      idempotencyKey?: string;
      source?: string;
    },
  ) {
    if (payment.type !== PaymentType.SUBSCRIPTION_FEE) {
      throw new BadRequestException('Invalid payment type for subscription activation');
    }

    const now = new Date();
    const billingCycle = payment.billingCycle || 'monthly';
    const periodEnd = new Date(now);
    if (billingCycle === 'yearly') {
      periodEnd.setDate(periodEnd.getDate() + 365);
    } else {
      periodEnd.setDate(periodEnd.getDate() + 30);
    }

    const updated = await this.paymentModel
      .findOneAndUpdate(
        {
          _id: payment._id,
          status: { $in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING] },
        },
        {
          $set: {
            status: PaymentStatus.COMPLETED,
            escrowStatus: EscrowStatus.NOT_APPLICABLE,
            adminWalletStatus: AdminWalletStatus.RECEIVED,
            lawyerAmount: 0,
            platformRevenue: payment.amount,
            platformFee: 0,
            platformFeeAmount: 0,
            completedAt: now,
            paidAt: now,
            receiptNumber: payment.receiptNumber || `RCP-SUB-${Date.now()}`,
            providerTransactionId: opts.providerTransactionId,
            transactionId: opts.providerTransactionId,
            providerReference: opts.providerReference || payment.providerReference,
            idempotencyKey: opts.idempotencyKey,
          },
        },
        { new: true },
      )
      .exec();

    if (!updated) {
      const existing = await this.paymentModel.findById(payment._id).exec();
      if (existing?.status === PaymentStatus.COMPLETED) {
        return existing;
      }
      throw new HttpException('Invalid payment status for subscription completion', HttpStatus.BAD_REQUEST);
    }

    if (Number(updated.amount || 0) > 0) {
      await this.platformWalletModel.findOneAndUpdate(
        { walletId: PLATFORM_WALLET_ID },
        { $inc: { balancePkr: updated.amount } },
        { upsert: true, new: true },
      );
    }

    const subscriptionId = updated.subscriptionId;
    if (!subscriptionId) {
      throw new BadRequestException('Subscription payment missing subscriptionId');
    }

    await this.subscriptionModel.updateMany(
      {
        lawyerId: updated.lawyerId,
        status: LawyerSubscriptionStatus.ACTIVE,
        _id: { $ne: subscriptionId },
      },
      { $set: { status: LawyerSubscriptionStatus.EXPIRED } },
    );

    await this.subscriptionModel.updateOne(
      { _id: subscriptionId },
      {
        $set: {
          status: LawyerSubscriptionStatus.ACTIVE,
          planCode: updated.planCode,
          billingCycle: updated.billingCycle,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          lastPaymentId: updated._id,
          cancelAtPeriodEnd: false,
          cancelledAt: null,
        },
      },
    );

    await this.syncLawyerProfileTier(updated.lawyerId.toString(), updated.planCode as SubscriptionPlanCode, periodEnd);

    const lawyerId = updated.payerId?.toString() || updated.lawyerId.toString();
    await this.notificationService.createNotification(
      lawyerId,
      NotificationType.SUBSCRIPTION_ACTIVATED,
      'Subscription activated',
      `Your ${updated.planCode} plan is active until ${periodEnd.toLocaleDateString()}.`,
      {
        subscriptionId: subscriptionId.toString(),
        paymentId: updated._id.toString(),
        planCode: updated.planCode,
      },
      '/lawyer/subscription',
    );

    return updated;
  }

  async syncLawyerProfileTier(
    lawyerId: string,
    planCode: SubscriptionPlanCode,
    expiresAt: Date | null,
  ) {
    const plan = getSubscriptionPlan(planCode) || getSubscriptionPlan('free')!;
    const badge =
      planCode === 'premium' ? 'premium' : planCode === 'professional' ? 'professional' : null;

    await this.userModel.updateOne(
      { _id: lawyerId },
      {
        $set: {
          'lawyerProfile.subscriptionTier': planCode,
          'lawyerProfile.subscriptionExpiresAt': expiresAt,
          'lawyerProfile.subscriptionBadge': badge,
        },
      },
    );
  }

  async downgradeLawyerToFree(lawyerId: string) {
    await this.syncLawyerProfileTier(lawyerId, 'free', null);
  }

  async findEffectiveActiveSubscription(lawyerId: string) {
    const now = new Date();
    return this.subscriptionModel
      .findOne({
        lawyerId: new Types.ObjectId(lawyerId),
        status: LawyerSubscriptionStatus.ACTIVE,
        currentPeriodEnd: { $gt: now },
      })
      .sort({ currentPeriodEnd: -1 })
      .exec();
  }

  resolveEffectivePlanCode(
    active: LawyerSubscriptionDocument | null,
    profile?: { subscriptionTier?: string } | null,
  ): SubscriptionPlanCode {
    if (active && active.status === LawyerSubscriptionStatus.ACTIVE) {
      return active.planCode;
    }
    const tier = (profile?.subscriptionTier || 'free') as SubscriptionPlanCode;
    return tier || 'free';
  }

  async listAdminSubscriptions(filters: {
    status?: string;
    planCode?: string;
    page?: number;
    limit?: number;
  }) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;
    const query: Record<string, unknown> = {};
    if (filters.status) query.status = filters.status;
    if (filters.planCode) query.planCode = filters.planCode;

    const [data, total] = await Promise.all([
      this.subscriptionModel
        .find(query)
        .populate('lawyerId', 'email lawyerProfile.fullName lawyerProfile.verificationStatus')
        .populate('lastPaymentId')
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.subscriptionModel.countDocuments(query),
    ]);

    return {
      success: true,
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 0 },
    };
  }

  async adminOverrideSubscription(
    subscriptionId: string,
    action: 'activate' | 'expire' | 'cancel' | 'mark_failed',
    body?: { planCode?: SubscriptionPlanCode; billingCycle?: SubscriptionBillingCycle; days?: number },
  ) {
    const sub = await this.subscriptionModel.findById(subscriptionId).exec();
    if (!sub) {
      throw new NotFoundException('Subscription not found');
    }

    const lawyerId = sub.lawyerId.toString();
    const now = new Date();

    switch (action) {
      case 'activate': {
        const planCode = (body?.planCode || sub.planCode || 'professional') as SubscriptionPlanCode;
        const cycle = body?.billingCycle || sub.billingCycle || 'monthly';
        const days = body?.days ?? (cycle === 'yearly' ? 365 : 30);
        const periodEnd = new Date(now);
        periodEnd.setDate(periodEnd.getDate() + days);
        sub.status = LawyerSubscriptionStatus.ACTIVE;
        sub.planCode = planCode;
        sub.billingCycle = cycle;
        sub.currentPeriodStart = now;
        sub.currentPeriodEnd = periodEnd;
        sub.cancelAtPeriodEnd = false;
        sub.cancelledAt = null;
        await sub.save();
        await this.syncLawyerProfileTier(lawyerId, planCode, periodEnd);
        break;
      }
      case 'expire':
        sub.status = LawyerSubscriptionStatus.EXPIRED;
        await sub.save();
        await this.downgradeLawyerToFree(lawyerId);
        break;
      case 'cancel':
        sub.status = LawyerSubscriptionStatus.CANCELLED;
        sub.cancelledAt = now;
        sub.cancelAtPeriodEnd = true;
        await sub.save();
        await this.downgradeLawyerToFree(lawyerId);
        break;
      case 'mark_failed':
        sub.status = LawyerSubscriptionStatus.FAILED;
        await sub.save();
        break;
      default:
        throw new BadRequestException('Invalid action');
    }

    return { success: true, data: sub };
  }

  async markSubscriptionPaymentFailed(payment: PaymentDocument, failureReason: string) {
    if (payment.subscriptionId) {
      await this.subscriptionModel.updateOne(
        { _id: payment.subscriptionId },
        { $set: { status: LawyerSubscriptionStatus.FAILED } },
      );
    }
    const notifyId = payment.payerId?.toString() || payment.lawyerId.toString();
    await this.notificationService.createNotification(
      notifyId,
      NotificationType.SUBSCRIPTION_PAYMENT_FAILED,
      'Subscription payment failed',
      failureReason,
      { paymentId: payment._id.toString() },
      '/lawyer/subscription',
    );
  }

  async expireDueSubscriptions(): Promise<number> {
    const now = new Date();
    const due = await this.subscriptionModel
      .find({
        status: LawyerSubscriptionStatus.ACTIVE,
        currentPeriodEnd: { $lte: now },
      })
      .exec();

    let count = 0;
    for (const sub of due) {
      sub.status = LawyerSubscriptionStatus.EXPIRED;
      await sub.save();
      await this.downgradeLawyerToFree(sub.lawyerId.toString());
      await this.notificationService.createNotification(
        sub.lawyerId.toString(),
        NotificationType.SUBSCRIPTION_EXPIRED,
        'Subscription expired',
        'Your paid plan has ended. You are now on the Free plan.',
        { subscriptionId: sub._id.toString() },
        '/lawyer/subscription',
      );
      count += 1;
    }
    return count;
  }

  private assertProviderMethodMatch(method: PaymentMethod) {
    if (this.paymentProviderName === 'jazzcash' && method !== PaymentMethod.JAZZCASH) {
      throw new BadRequestException('Selected method does not match JazzCash provider');
    }
    if (this.paymentProviderName === 'easypaisa' && method !== PaymentMethod.EASYPAISA) {
      throw new BadRequestException('Selected method does not match EasyPaisa provider');
    }
    if (this.paymentProviderName === 'card' && method !== PaymentMethod.CARD) {
      throw new BadRequestException('Card provider is not available');
    }
  }
}
