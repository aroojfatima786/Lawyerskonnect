import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ContactInquiryDocument = ContactInquiry & Document;

@Schema({ timestamps: true })
export class ContactInquiry {
  @Prop({ required: true, trim: true, maxlength: 200 })
  name: string;

  @Prop({ required: true, trim: true, lowercase: true, maxlength: 200 })
  email: string;

  @Prop({ required: true, trim: true, maxlength: 300 })
  subject: string;

  @Prop({ required: true, trim: true, maxlength: 5000 })
  message: string;
}

export const ContactInquirySchema = SchemaFactory.createForClass(ContactInquiry);

ContactInquirySchema.index({ createdAt: -1 });
