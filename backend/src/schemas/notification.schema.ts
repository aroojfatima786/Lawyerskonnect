import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type NotificationDocument = Notification & Document;

export enum NotificationType {
  // Appointment related
  APPOINTMENT_BOOKED = 'appointment_booked',
  APPOINTMENT_CONFIRMED = 'appointment_confirmed',
  APPOINTMENT_CANCELLED = 'appointment_cancelled',
  APPOINTMENT_RESCHEDULED = 'appointment_rescheduled',
  APPOINTMENT_REMINDER = 'appointment_reminder',
  APPOINTMENT_COMPLETED = 'appointment_completed',
  
  // Payment related
  PAYMENT_RECEIVED = 'payment_received',
  PAYMENT_SENT = 'payment_sent',
  PAYMENT_FAILED = 'payment_failed',
  REFUND_PROCESSED = 'refund_processed',
  
  // Verification related
  VERIFICATION_SUBMITTED = 'verification_submitted',
  VERIFICATION_APPROVED = 'verification_approved',
  VERIFICATION_REJECTED = 'verification_rejected',
  
  // Review related
  NEW_REVIEW = 'new_review',
  REVIEW_REPLY = 'review_reply',
  
  // Message related
  NEW_MESSAGE = 'new_message',
  
  // System / Admin
  SYSTEM_ANNOUNCEMENT = 'system_announcement',
  ACCOUNT_UPDATE = 'account_update',
  ADMIN_VERIFICATION_REQUEST = 'admin_verification_request',
  ADMIN_PENDING_PAYMENT = 'admin_pending_payment', // Unpaid consultation - notify until case complete

  // Subscription (lawyer)
  SUBSCRIPTION_ACTIVATED = 'subscription_activated',
  SUBSCRIPTION_EXPIRING = 'subscription_expiring',
  SUBSCRIPTION_EXPIRED = 'subscription_expired',
  SUBSCRIPTION_PAYMENT_FAILED = 'subscription_payment_failed',
  SUBSCRIPTION_CANCELLED = 'subscription_cancelled',
}

@Schema({ timestamps: true })
export class Notification {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: String, enum: Object.values(NotificationType), required: true })
  type: NotificationType;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true, trim: true, maxlength: 500 })
  message: string;

  @Prop({ type: Object, default: {} })
  data?: Record<string, any>; // Additional data (appointmentId, lawyerId, etc.)

  @Prop({ default: false })
  isRead: boolean;

  @Prop({ type: Date })
  readAt?: Date;

  @Prop({ trim: true })
  actionUrl?: string; // URL to navigate when clicked

  @Prop({ default: false })
  isDeleted: boolean;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);

// Indexes
NotificationSchema.index({ userId: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, isRead: 1 });
NotificationSchema.index({ type: 1 });
