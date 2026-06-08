import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ChatViolationDocument = ChatViolation & Document;

export enum ChatViolationType {
  CONTACT_SHARING = 'contact_sharing',
}

@Schema({ timestamps: true })
export class ChatViolation {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  senderId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  receiverId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Appointment' })
  appointmentId?: Types.ObjectId;

  @Prop({ trim: true })
  conversationId?: string;

  @Prop({ required: true, trim: true, maxlength: 500 })
  messageExcerpt: string;

  @Prop({ type: String, enum: Object.values(ChatViolationType), default: ChatViolationType.CONTACT_SHARING })
  violationType: ChatViolationType;
}

export const ChatViolationSchema = SchemaFactory.createForClass(ChatViolation);

ChatViolationSchema.index({ senderId: 1, createdAt: -1 });
ChatViolationSchema.index({ receiverId: 1, createdAt: -1 });
ChatViolationSchema.index({ appointmentId: 1, createdAt: -1 });
