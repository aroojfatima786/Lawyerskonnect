import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import type { SupportedPaymentProvider } from '../payments/providers/payment-provider.interface';

export type PaymentDocument = Payment & Document;

export enum PaymentMethod {
  JAZZCASH = 'jazzcash',
  EASYPAISA = 'easypaisa',
  CARD = 'card',
  BANK_TRANSFER = 'bank_transfer',
  MANUAL = 'manual',
}

export enum PaymentStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REFUNDED = 'refunded',
  CANCELLED = 'cancelled',
}

export enum PaymentType {
  CONSULTATION_FEE = 'consultation_fee',
  SUBSCRIPTION_FEE = 'subscription_fee',
  LAWYER_REGISTRATION_FEE = 'lawyer_registration_fee',
  REFUND = 'refund',
}

export enum PaymentPayerRole {
  CITIZEN = 'citizen',
  LAWYER = 'lawyer',
}

export type SubscriptionPlanCode = 'free' | 'professional' | 'premium';
export type SubscriptionBillingCycle = 'monthly' | 'yearly';

export enum EscrowStatus {
  NOT_APPLICABLE = 'not_applicable',
  HELD = 'held',
  ELIGIBLE_FOR_RELEASE = 'eligible_for_release',
  RELEASED = 'released',
  REFUNDED = 'refunded',
}

export enum AdminWalletStatus {
  NOT_RECEIVED = 'not_received',
  RECEIVED = 'received',
  REFUNDED = 'refunded',
}

@Schema({ _id: false })
export class CitizenPaymentMethod {
  @Prop({ type: String, enum: ['manual', 'jazzcash', 'easypaisa', 'card'], required: true })
  type: 'manual' | 'jazzcash' | 'easypaisa' | 'card';

  @Prop({ trim: true })
  accountLabel?: string;

  @Prop({ trim: true })
  accountLast4?: string;

  @Prop({ trim: true })
  mobileNumberMasked?: string;
}
export const CitizenPaymentMethodSchema = SchemaFactory.createForClass(CitizenPaymentMethod);

@Schema({ timestamps: true })
export class Payment {
  @Prop({ type: Types.ObjectId, ref: 'User', required: false })
  citizenId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  lawyerId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: false })
  payerId?: Types.ObjectId;

  @Prop({ type: String, enum: Object.values(PaymentPayerRole), required: false })
  payerRole?: PaymentPayerRole;

  @Prop({ type: Types.ObjectId, ref: 'LawyerSubscription', required: false })
  subscriptionId?: Types.ObjectId;

  @Prop({ type: String, enum: ['free', 'professional', 'premium'], required: false })
  planCode?: SubscriptionPlanCode;

  @Prop({ type: String, enum: ['monthly', 'yearly'], required: false })
  billingCycle?: SubscriptionBillingCycle;

  @Prop({ type: Types.ObjectId, ref: 'Appointment', required: false })
  appointmentId?: Types.ObjectId;

  @Prop({ required: true, min: 0 })
  amount: number;

  @Prop({ default: 'PKR' })
  currency: string;

  @Prop({ type: String, enum: Object.values(PaymentMethod), required: true })
  method: PaymentMethod;

  @Prop({ type: String, enum: ['manual', 'jazzcash', 'easypaisa', 'card'], default: 'manual' })
  provider: SupportedPaymentProvider;

  @Prop({ type: CitizenPaymentMethodSchema, default: null })
  citizenPaymentMethod?: CitizenPaymentMethod | null;

  @Prop({ trim: true })
  providerEnv?: string;

  @Prop({ trim: true })
  providerTransactionId?: string;

  @Prop({ trim: true })
  providerReference?: string;

  @Prop({ trim: true })
  stripeSessionId?: string;

  @Prop({ type: String, enum: Object.values(PaymentStatus), default: PaymentStatus.PENDING })
  status: PaymentStatus;

  @Prop({ type: String, enum: Object.values(PaymentType), default: PaymentType.CONSULTATION_FEE })
  type: PaymentType;

  @Prop({ type: String, enum: Object.values(EscrowStatus), default: EscrowStatus.NOT_APPLICABLE })
  escrowStatus: EscrowStatus;

  @Prop({ type: String, enum: Object.values(AdminWalletStatus), default: AdminWalletStatus.NOT_RECEIVED })
  adminWalletStatus: AdminWalletStatus;

  @Prop({ trim: true })
  transactionId?: string; // From payment gateway

  @Prop({ trim: true })
  referenceNumber?: string; // Internal reference

  @Prop({ type: Object, default: {} })
  gatewayResponse?: Record<string, any>; // Store gateway response

  @Prop({ type: Object, default: {} })
  providerResponse?: Record<string, any>; // Sanitized provider callback/response

  @Prop({ trim: true })
  failureReason?: string;

  @Prop({ type: Date })
  paidAt?: Date;

  @Prop({ trim: true })
  receiptNumber?: string;

  @Prop({ trim: true })
  idempotencyKey?: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({ type: Date })
  completedAt?: Date;

  @Prop({ type: Date })
  refundedAt?: Date;

  @Prop({ trim: true })
  refundReason?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  refundedBy?: Types.ObjectId; // Admin who processed refund

  // Platform fee (percentage kept by platform)
  @Prop({ default: 10, min: 0, max: 100 })
  platformFeePercent: number;

  @Prop({ default: 0, min: 0 })
  platformFeeAmount: number;

  @Prop({ default: 0, min: 0 })
  platformFee: number;

  @Prop({ default: 0, min: 0 })
  lawyerAmount: number; // Amount lawyer receives after platform fee

  @Prop({ default: 0, min: 0 })
  platformRevenue: number;

  // Lawyer gets payout only after consultation is completed (case complete)
  @Prop({ default: false })
  lawyerPayoutReleased: boolean;

  @Prop({ type: Date })
  lawyerPayoutReleasedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'Payout' })
  payoutId?: Types.ObjectId;

  @Prop({ type: Date })
  payoutReleasedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  payoutReleasedBy?: Types.ObjectId;
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);

// Indexes
PaymentSchema.index({ citizenId: 1, createdAt: -1 });
PaymentSchema.index({ lawyerId: 1, createdAt: -1 });
PaymentSchema.index({ appointmentId: 1 });
PaymentSchema.index({ status: 1 });
PaymentSchema.index({ transactionId: 1 });
PaymentSchema.index({ provider: 1, providerReference: 1 });
PaymentSchema.index({ stripeSessionId: 1 });
PaymentSchema.index({ providerTransactionId: 1 });
PaymentSchema.index({ idempotencyKey: 1 });
PaymentSchema.index({ escrowStatus: 1 });
PaymentSchema.index({ adminWalletStatus: 1 });
PaymentSchema.index({ type: 1, createdAt: -1 });
PaymentSchema.index({ subscriptionId: 1 });
PaymentSchema.index({ payerId: 1, createdAt: -1 });
