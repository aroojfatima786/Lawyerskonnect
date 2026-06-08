import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type LegalChatHistoryDocument = LegalChatHistory & Document;

@Schema({ timestamps: true })
export class LegalChatHistory {
  @Prop({ type: Types.ObjectId, ref: 'User' })
  userId?: Types.ObjectId;

  @Prop({ required: true, trim: true })
  question: string;

  @Prop({ required: true, trim: true })
  answer: string;

  @Prop({ type: String, enum: ['english', 'urdu', 'roman_urdu'], default: 'english' })
  language: 'english' | 'urdu' | 'roman_urdu';

  @Prop({ trim: true, default: 'Other' })
  category: string;

  @Prop({ type: String, enum: ['low', 'medium', 'high'], default: 'low' })
  urgency: 'low' | 'medium' | 'high';

  @Prop({ type: [Types.ObjectId], ref: 'LegalKnowledge', default: [] })
  legalReferenceIds: Types.ObjectId[];

  @Prop({ type: [Types.ObjectId], ref: 'User', default: [] })
  suggestedLawyerIds: Types.ObjectId[];
}

export const LegalChatHistorySchema = SchemaFactory.createForClass(LegalChatHistory);
LegalChatHistorySchema.index({ userId: 1, createdAt: -1 });
