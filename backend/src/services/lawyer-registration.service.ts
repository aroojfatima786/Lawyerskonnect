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
  Payment,
  PaymentDocument,
  PaymentMethod,
  PaymentPayerRole,
  PaymentStatus,
  PaymentType,
  EscrowStatus,
  AdminWalletStatus,
} from '../schemas/payment.schema';
import { User, UserDocument, UserRole } from '../schemas/user.schema';
import { PlatformWallet, PlatformWalletDocument } from '../schemas/platform-wallet.schema';
import { AppointmentDocument } from '../schemas/appointment.schema';
import { NotificationType } from '../schemas/notification.schema';
import { NotificationService } from './notification.service';
import { PaymentProviderFactory } from '../payments/payment-provider.factory';
import { PaymentProvider, SupportedPaymentProvider } from '../payments/providers/payment-provider.interface';
import { getLawyerRegistrationFeePkr } from '../config/lawyer-registration';

const PLATFORM_WALLET_ID = 'platform';

@Injectable()
export class LawyerRegistrationService {
  private readonly logger = new Logger(LawyerRegistrationService.name);
  private readonly paymentProviderName: SupportedPaymentProvider;
  private readonly paymentProvider: PaymentProvider;

  constructor(
    @InjectModel(Payment.name) private paymentModel: Model<PaymentDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(PlatformWallet.name) private platformWalletModel: Model<PlatformWalletDocument>,
    private notificationService: NotificationService,
  ) {
    this.paymentProviderName = PaymentProviderFactory.resolveProviderNameFromEnv();
    this.paymentProvider = PaymentProviderFactory.create(this.paymentProviderName);
  }

  needsRegistrationPayment(user: UserDocument): boolean {
    if (user.role !== UserRole.LAWYER) return false;
    return user.lawyerRegistrationFeePaid === false;
  }

  /** Reconcile user.lawyerRegistrationFeePaid from a completed registration payment record. */
  async ensureRegistrationPaidFromRecords(userId: string): Promise<boolean> {
    const user = await this.userModel.findById(userId).exec();
    if (!user || user.role !== UserRole.LAWYER) return false;
    if (user.lawyerRegistrationFeePaid === true) return true;

    const completed = await this.paymentModel
      .findOne({
        lawyerId: new Types.ObjectId(userId),
        type: PaymentType.LAWYER_REGISTRATION_FEE,
        status: PaymentStatus.COMPLETED,
      })
      .sort({ paidAt: -1, completedAt: -1 })
      .exec();

    if (!completed) return false;

    user.lawyerRegistrationFeePaid = true;
    user.lawyerRegistrationPaidAt =
      completed.paidAt || completed.completedAt || new Date();
    await user.save();
    return true;
  }

  getFeeInfo() {
    const amount = getLawyerRegistrationFeePkr();
    return {
      success: true,
      data: {
        amount,
        currency: 'PKR',
        description: 'Lawyer platform registration fee',
      },
    };
  }

  async getRegistrationStatus(userId: string) {
    const user = await this.userModel.findById(userId).exec();
    if (!user || user.role !== UserRole.LAWYER) {
      throw new NotFoundException('Lawyer account not found');
    }
    const paid = !this.needsRegistrationPayment(user);
    const pending = await this.paymentModel
      .findOne({
        lawyerId: new Types.ObjectId(userId),
        type: PaymentType.LAWYER_REGISTRATION_FEE,
        status: PaymentStatus.PENDING,
      })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    return {
      success: true,
      data: {
        registrationFeePaid: paid,
        emailVerified: user.emailVerified,
        amount: getLawyerRegistrationFeePkr(),
        pendingPaymentId: pending?._id?.toString() || null,
      },
    };
  }

  async checkout(
    userId: string,
    body: {
      method: PaymentMethod;
      accountIdentifier?: string;
      stripeCheckout?: boolean;
    },
  ) {
    const amount = getLawyerRegistrationFeePkr();
    if (amount <= 0) {
      throw new BadRequestException('Registration fee is not configured');
    }

    const lawyer = await this.userModel.findById(userId).exec();
    if (!lawyer || lawyer.role !== UserRole.LAWYER) {
      throw new NotFoundException('Lawyer account not found');
    }
    if (!this.needsRegistrationPayment(lawyer)) {
      throw new BadRequestException('Registration fee has already been paid');
    }
    if (!lawyer.emailVerified) {
      throw new BadRequestException(
        'Please verify your email before paying the registration fee.',
      );
    }

    const normalizedMethod =
      body.method === PaymentMethod.BANK_TRANSFER ? PaymentMethod.MANUAL : body.method;
    if (!body.stripeCheckout) {
      this.assertProviderMethodMatch(normalizedMethod);
    }

    await this.paymentModel.updateMany(
      {
        lawyerId: new Types.ObjectId(userId),
        type: PaymentType.LAWYER_REGISTRATION_FEE,
        status: PaymentStatus.PENDING,
      },
      { $set: { status: PaymentStatus.CANCELLED } },
    );

    const referenceNumber = `LKREG${Date.now()}-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;

    const payment = new this.paymentModel({
      type: PaymentType.LAWYER_REGISTRATION_FEE,
      payerId: new Types.ObjectId(userId),
      payerRole: PaymentPayerRole.LAWYER,
      lawyerId: new Types.ObjectId(userId),
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
      description: 'Lawyer platform registration fee',
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

    const stubAppointment = { _id: payment._id } as AppointmentDocument;

    if (body.stripeCheckout) {
      payment.provider = 'manual';
      payment.providerReference = referenceNumber;
      payment.gatewayResponse = {
        stripe: true,
        checkoutType: 'registration',
        checkoutMethod: normalizedMethod,
      };
      await payment.save();

      return {
        success: true,
        message: 'Registration checkout prepared for Stripe',
        data: {
          paymentId: payment._id.toString(),
          referenceNumber,
          amount,
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
      message: 'Registration checkout initiated',
      data: {
        paymentId: payment._id.toString(),
        referenceNumber,
        amount,
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

  async confirmRegistrationPayment(
    paymentId: string,
    userId: string,
    transactionId?: string,
    failure?: { code: 'declined' | 'gateway_unavailable'; reason?: string },
  ) {
    const payment = await this.paymentModel.findById(paymentId).exec();
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }
    if (payment.type !== PaymentType.LAWYER_REGISTRATION_FEE) {
      throw new BadRequestException('Not a registration payment');
    }
    if (payment.payerId?.toString() !== userId) {
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
      throw new BadRequestException('Payment declined');
    }

    await this.activateFromPayment(payment, {
      providerTransactionId: transactionId || `TXN${Date.now()}`,
      providerReference: payment.providerReference || payment.referenceNumber,
      idempotencyKey: payment.referenceNumber,
      source: 'manual_confirm',
    });

    const fresh = await this.paymentModel.findById(paymentId).exec();
    return { success: true, message: 'Registration payment confirmed', data: fresh };
  }

  /** Called from PaymentService gateway / Stripe success path. */
  async activateFromPayment(
    payment: PaymentDocument,
    opts: {
      providerTransactionId?: string;
      providerReference?: string;
      idempotencyKey?: string;
      source?: string;
    },
  ) {
    if (payment.type !== PaymentType.LAWYER_REGISTRATION_FEE) {
      throw new BadRequestException('Invalid payment type for registration activation');
    }

    const now = new Date();
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
            receiptNumber: payment.receiptNumber || `RCP-REG-${Date.now()}`,
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
        const lawyerId = existing.lawyerId.toString();
        const existingUser = await this.userModel.findById(lawyerId).exec();
        if (existingUser && existingUser.lawyerRegistrationFeePaid !== true) {
          existingUser.lawyerRegistrationFeePaid = true;
          existingUser.lawyerRegistrationPaidAt =
            existing.paidAt || existing.completedAt || new Date();
          await existingUser.save();
        }
        return existing;
      }
      throw new HttpException('Invalid payment status for registration completion', HttpStatus.BAD_REQUEST);
    }

    if (Number(updated.amount || 0) > 0) {
      await this.platformWalletModel.findOneAndUpdate(
        { walletId: PLATFORM_WALLET_ID },
        { $inc: { balancePkr: updated.amount } },
        { upsert: true, new: true },
      );
    }

    const lawyerId = updated.lawyerId.toString();
    const user = await this.userModel.findById(lawyerId).exec();
    if (user && user.lawyerRegistrationFeePaid !== true) {
      user.lawyerRegistrationFeePaid = true;
      user.lawyerRegistrationPaidAt = now;
      await user.save();
    }

    await this.notificationService.createNotification(
      lawyerId,
      NotificationType.ACCOUNT_UPDATE,
      'Registration fee received',
      'Your lawyer registration payment was successful. Sign in to complete your profile.',
      { paymentId: updated._id.toString() },
      '/auth/lawyer/login',
    );

    return updated;
  }

  private assertProviderMethodMatch(method: PaymentMethod) {
    const p = this.paymentProviderName;
    if (p === 'manual') return;
    if (p === 'jazzcash' && method !== PaymentMethod.JAZZCASH) {
      throw new BadRequestException('JazzCash is the configured payment provider');
    }
    if (p === 'easypaisa' && method !== PaymentMethod.EASYPAISA) {
      throw new BadRequestException('EasyPaisa is the configured payment provider');
    }
  }
}
