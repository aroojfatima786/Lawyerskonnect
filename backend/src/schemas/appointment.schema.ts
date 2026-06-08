import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AppointmentDocument = Appointment & Document;

export enum AppointmentStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  CANCELLED = 'cancelled',
  COMPLETED = 'completed',
  NO_SHOW = 'no_show',
  RESCHEDULED = 'rescheduled',
}

export enum ConsultationType {
  ONLINE = 'online',
  IN_PERSON = 'in_person',
  PHONE = 'phone',
}

@Schema({ timestamps: true })
export class Appointment {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  citizenId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  lawyerId: Types.ObjectId;

  @Prop({ required: true })
  appointmentDate: Date;

  @Prop({ required: true })
  startTime: string; // Format: "HH:mm" (24-hour)

  @Prop({ required: true })
  endTime: string; // Format: "HH:mm" (24-hour)

  @Prop({ default: 30, min: 15 })
  duration: number; // in minutes

  @Prop({ type: String, enum: Object.values(ConsultationType), default: ConsultationType.ONLINE })
  consultationType: ConsultationType;

  @Prop({ type: String, enum: Object.values(AppointmentStatus), default: AppointmentStatus.PENDING })
  status: AppointmentStatus;

  @Prop({ trim: true, maxlength: 1000 })
  description?: string; // Case description from citizen

  @Prop({ trim: true })
  caseCategory?: string; // e.g., "Family Law", "Criminal Law"

  @Prop({ default: 0, min: 0 })
  fee: number;

  @Prop({ default: false })
  isPaid: boolean;

  @Prop({ type: Types.ObjectId, ref: 'Payment' })
  paymentId?: Types.ObjectId;

  // For online consultations
  @Prop({ trim: true })
  meetingLink?: string;

  @Prop({ trim: true })
  meetingPassword?: string;

  // For in-person consultations
  @Prop({ trim: true })
  location?: string;

  // Notes
  @Prop({ trim: true, maxlength: 2000 })
  lawyerNotes?: string; // Private notes by lawyer

  @Prop({ trim: true, maxlength: 1000 })
  cancellationReason?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  cancelledBy?: Types.ObjectId;

  @Prop({ type: Date })
  cancelledAt?: Date;

  // Rescheduling
  @Prop({ type: Date })
  originalDate?: Date;

  @Prop({ trim: true })
  originalStartTime?: string;

  @Prop({ trim: true, maxlength: 500 })
  rescheduleReason?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  rescheduledBy?: Types.ObjectId;

  // Reminders
  @Prop({ default: false })
  reminderSent: boolean;

  @Prop({ type: Date })
  reminderSentAt?: Date;

  @Prop({ default: false })
  consultationStartNotified: boolean;

  @Prop({ type: Date })
  consultationStartNotifiedAt?: Date;

  /** Set when consultation end auto-closure runs (no lawyer chat participation). */
  @Prop({ type: Date })
  consultationAutoClosedAt?: Date;

  // Completion
  @Prop({ type: Date })
  completedAt?: Date;

  @Prop({ default: false })
  hasReview: boolean;
}

export const AppointmentSchema = SchemaFactory.createForClass(Appointment);

// Indexes
AppointmentSchema.index({ citizenId: 1, appointmentDate: -1 });
AppointmentSchema.index({ lawyerId: 1, appointmentDate: -1 });
AppointmentSchema.index({ status: 1 });
AppointmentSchema.index({ appointmentDate: 1, status: 1 });
AppointmentSchema.index({ lawyerId: 1, appointmentDate: 1, startTime: 1 }); // For availability check
