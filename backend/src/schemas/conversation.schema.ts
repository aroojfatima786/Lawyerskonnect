import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ConversationDocument = Conversation & Document;

@Schema({ timestamps: true })
export class Conversation {
  @Prop({ type: String, required: true, unique: true })
  conversationId: string; // Format: sortedUserId1_sortedUserId2

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], required: true })
  participants: Types.ObjectId[];

  @Prop({ type: Types.ObjectId, ref: 'Appointment' })
  appointmentId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Message' })
  lastMessageId?: Types.ObjectId;

  @Prop({ trim: true })
  lastMessageContent?: string;

  @Prop({ type: Date })
  lastMessageAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  lastMessageSenderId?: Types.ObjectId;

  @Prop({ type: Object, default: {} })
  unreadCount: Record<string, number>; // { odId1: count, odId2: count }

  @Prop({ default: true })
  isActive: boolean;

  /** Users who removed this thread from their sidebar (messages remain). */
  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  hiddenBy?: Types.ObjectId[];
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation);

// Indexes
ConversationSchema.index({ participants: 1 });
ConversationSchema.index({ lastMessageAt: -1 });
