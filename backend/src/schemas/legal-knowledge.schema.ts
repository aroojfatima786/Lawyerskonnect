import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type LegalKnowledgeDocument = LegalKnowledge & Document;

export enum LegalKnowledgeStatus {
  ACTIVE = 'active',
  DRAFT = 'draft',
  ARCHIVED = 'archived',
}

export enum LegalKnowledgeLanguage {
  ENGLISH = 'english',
  URDU = 'urdu',
  ROMAN_URDU = 'roman_urdu',
}

@Schema({ timestamps: true })
export class LegalKnowledge {
  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true, trim: true })
  source: string;

  @Prop({ trim: true })
  sourceUrl?: string;

  @Prop({ default: 'Pakistan', trim: true })
  jurisdiction: string;

  @Prop({ required: true, trim: true })
  category: string;

  @Prop({ trim: true })
  actName?: string;

  @Prop({ trim: true })
  sectionNumber?: string;

  @Prop({ required: true, trim: true })
  content: string;

  @Prop({ trim: true })
  summary?: string;

  @Prop({ type: String, enum: Object.values(LegalKnowledgeLanguage), default: LegalKnowledgeLanguage.ENGLISH })
  language: LegalKnowledgeLanguage;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ type: String, enum: Object.values(LegalKnowledgeStatus), default: LegalKnowledgeStatus.ACTIVE })
  status: LegalKnowledgeStatus;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  updatedBy?: Types.ObjectId;
}

export const LegalKnowledgeSchema = SchemaFactory.createForClass(LegalKnowledge);
LegalKnowledgeSchema.index({ title: 'text', content: 'text', tags: 'text', actName: 'text', sectionNumber: 'text' });
LegalKnowledgeSchema.index({ category: 1, status: 1, language: 1, createdAt: -1 });
