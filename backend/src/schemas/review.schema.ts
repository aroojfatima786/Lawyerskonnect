import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ReviewDocument = Review & Document;

@Schema({ timestamps: true })
export class Review {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  citizenId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  lawyerId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Appointment', required: false })
  appointmentId?: Types.ObjectId;

  @Prop({ required: true, min: 1, max: 5 })
  rating: number;

  @Prop({ trim: true, maxlength: 1000 })
  comment?: string;

  @Prop({ default: true })
  isVisible: boolean;

  @Prop({ type: String, default: null })
  adminNote?: string; // Note if review was hidden/removed
}

export const ReviewSchema = SchemaFactory.createForClass(Review);

// Index for faster queries
ReviewSchema.index({ lawyerId: 1, createdAt: -1 });
ReviewSchema.index({ citizenId: 1 });
