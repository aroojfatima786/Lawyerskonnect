import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PayoutDocument = Payout & Document;

export enum PayoutStatus {
  PENDING = 'pending',
  ELIGIBLE = 'eligible',
  PROCESSING = 'processing',
  RELEASED = 'released',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

@Schema({ _id: false })
export class PayoutAccountSnapshot {
  @Prop({ type: String, enum: ['bank', 'jazzcash', 'easypaisa'], required: true })
  method: 'bank' | 'jazzcash' | 'easypaisa';

  @Prop({ required: true, trim: true })
  accountTitle: string;

  @Prop({ trim: true })
  bankName?: string;

  @Prop({ trim: true })
  maskedAccountNumber?: string;

  @Prop({ trim: true })
  maskedMobileNumber?: string;

  @Prop({ trim: true })
  maskedIban?: string;
}

export const PayoutAccountSnapshotSchema = SchemaFactory.createForClass(PayoutAccountSnapshot);

@Schema({ timestamps: true })
export class Payout {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  lawyerId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  citizenId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Appointment', required: true, index: true, unique: true })
  appointmentId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Payment', required: true, index: true, unique: true })
  paymentId: Types.ObjectId;

  @Prop({ required: true, min: 0 })
  grossAmount: number;

  @Prop({ required: true, min: 0 })
  platformFee: number;

  @Prop({ required: true, min: 0 })
  netAmount: number;

  @Prop({ default: 'PKR' })
  currency: string;

  @Prop({ type: String, enum: Object.values(PayoutStatus), default: PayoutStatus.PENDING })
  status: PayoutStatus;

  @Prop({ type: String, enum: ['bank', 'jazzcash', 'easypaisa'] })
  payoutMethod?: 'bank' | 'jazzcash' | 'easypaisa';

  @Prop({ type: PayoutAccountSnapshotSchema, default: null })
  payoutAccountSnapshot?: PayoutAccountSnapshot | null;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  releasedBy?: Types.ObjectId;

  @Prop({ type: Date })
  releasedAt?: Date;

  @Prop({ trim: true })
  externalTransferReference?: string;

  @Prop({ trim: true })
  failureReason?: string;

  @Prop({ trim: true })
  notes?: string;
}

export const PayoutSchema = SchemaFactory.createForClass(Payout);
PayoutSchema.index({ lawyerId: 1, createdAt: -1 });
PayoutSchema.index({ status: 1, createdAt: -1 });
