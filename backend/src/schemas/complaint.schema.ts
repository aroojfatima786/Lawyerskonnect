import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ComplaintDocument = Complaint & Document;

export enum ComplaintCategory {
  GENERAL = 'general',
  PAYMENT = 'payment',
  APPOINTMENT = 'appointment',
  LAWYER = 'lawyer',
  TECHNICAL = 'technical',
  OTHER = 'other',
}

export enum ComplaintStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
}

@Schema({ timestamps: true })
export class Complaint {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 200 })
  subject: string;

  @Prop({ required: true, trim: true, maxlength: 2000 })
  message: string;

  @Prop({ type: String, enum: Object.values(ComplaintCategory), default: ComplaintCategory.GENERAL })
  category: ComplaintCategory;

  @Prop({ type: String, enum: Object.values(ComplaintStatus), default: ComplaintStatus.OPEN })
  status: ComplaintStatus;

  @Prop({ trim: true, maxlength: 1000 })
  adminReply?: string;

  @Prop({ type: Date })
  adminRepliedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  repliedBy?: Types.ObjectId;
}

export const ComplaintSchema = SchemaFactory.createForClass(Complaint);

ComplaintSchema.index({ userId: 1, createdAt: -1 });
ComplaintSchema.index({ status: 1 });
ComplaintSchema.index({ createdAt: -1 });
