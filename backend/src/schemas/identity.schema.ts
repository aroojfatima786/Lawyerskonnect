import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type IdentityDocumentDocument = IdentityDocument & Document;

export enum DocumentType {
  CNIC = 'cnic',
  CNIC_FRONT = 'cnic_front',
  CNIC_BACK = 'cnic_back',
  SELFIE = 'selfie',
  BAR_CERTIFICATE = 'bar_certificate',
  LICENSE = 'license',
  DEGREE = 'degree',
  OTHER = 'other',
}

export enum DocumentStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

@Schema({ timestamps: true })
export class IdentityDocument {
  @Prop({ required: true, ref: 'User' })
  userId: string;

  @Prop({ required: true, enum: Object.values(DocumentType) })
  documentType: DocumentType;

  @Prop({ required: true })
  fileUrl: string;

  @Prop()
  originalName?: string;

  @Prop()
  mimeType?: string;

  @Prop()
  size?: number;

  @Prop({ required: true })
  filename: string;

  @Prop()
  cloudinaryPublicId?: string;

  @Prop()
  secureUrl?: string;

  @Prop({ required: true, enum: Object.values(DocumentStatus), default: DocumentStatus.PENDING })
  status: DocumentStatus;

  @Prop()
  uploadedAt: Date;

  @Prop()
  reviewedAt?: Date;

  @Prop({ ref: 'User' })
  reviewedBy?: string;

  @Prop()
  rejectionReason?: string;
}

export const IdentityDocumentSchema = SchemaFactory.createForClass(IdentityDocument);