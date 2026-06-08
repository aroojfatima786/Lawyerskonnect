import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import type { SubscriptionBillingCycle, SubscriptionPlanCode } from '../config/subscription-plans';

export type LawyerSubscriptionDocument = LawyerSubscription & Document;

export enum LawyerSubscriptionStatus {
  ACTIVE = 'active',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
  PENDING_PAYMENT = 'pending_payment',
  FAILED = 'failed',
}

@Schema({ timestamps: true })
export class LawyerSubscription {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  lawyerId: Types.ObjectId;

  @Prop({
    type: String,
    enum: ['free', 'professional', 'premium'],
    required: true,
  })
  planCode: SubscriptionPlanCode;

  @Prop({
    type: String,
    enum: Object.values(LawyerSubscriptionStatus),
    default: LawyerSubscriptionStatus.PENDING_PAYMENT,
  })
  status: LawyerSubscriptionStatus;

  @Prop({ type: String, enum: ['monthly', 'yearly'], default: null })
  billingCycle?: SubscriptionBillingCycle | null;

  @Prop({ type: Date, default: null })
  currentPeriodStart?: Date | null;

  @Prop({ type: Date, default: null })
  currentPeriodEnd?: Date | null;

  @Prop({ type: Types.ObjectId, ref: 'Payment', default: null })
  lastPaymentId?: Types.ObjectId | null;

  @Prop({ default: false })
  autoRenew: boolean;

  @Prop({ type: Date, default: null })
  cancelledAt?: Date | null;

  @Prop({ default: false })
  cancelAtPeriodEnd: boolean;
}

export const LawyerSubscriptionSchema = SchemaFactory.createForClass(LawyerSubscription);

LawyerSubscriptionSchema.index({ lawyerId: 1, status: 1 });
LawyerSubscriptionSchema.index({ currentPeriodEnd: 1, status: 1 });
