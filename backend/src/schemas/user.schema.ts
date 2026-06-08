import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

export enum UserRole {
  CITIZEN = 'citizen',
  LAWYER = 'lawyer',
  ADMIN = 'admin',
}

export enum VerificationStatus {
  PENDING = 'pending',
  VERIFIED = 'verified',
  REJECTED = 'rejected',
}

@Schema({ _id: false })
export class PaymentInfo {
  // Do NOT store full card details
  @Prop({ type: String, enum: ['jazzcash', 'easypaisa', 'card', 'bank'], default: null })
  methodType?: 'jazzcash' | 'easypaisa' | 'card' | 'bank' | null;

  @Prop({ trim: true })
  accountTitle?: string;

  // For JazzCash/EasyPaisa: phone / account number
  @Prop({ trim: true })
  accountIdentifier?: string;

  // Optional provider references
  @Prop({ trim: true })
  providerCustomerId?: string;

  @Prop({ default: false })
  isVerified: boolean;

  @Prop()
  verifiedAt?: Date;
}
export const PaymentInfoSchema = SchemaFactory.createForClass(PaymentInfo);

@Schema({ _id: false })
export class PayoutAccount {
  @Prop({ type: String, enum: ['bank', 'jazzcash', 'easypaisa'], default: null })
  method?: 'bank' | 'jazzcash' | 'easypaisa' | null;

  @Prop({ trim: true })
  accountTitle?: string;

  @Prop({ trim: true })
  bankName?: string;

  @Prop({ trim: true })
  accountNumber?: string;

  @Prop({ trim: true })
  iban?: string;

  @Prop({ trim: true })
  mobileNumber?: string;

  @Prop({ default: false })
  isVerified?: boolean;

  @Prop()
  updatedAt?: Date;
}
export const PayoutAccountSchema = SchemaFactory.createForClass(PayoutAccount);

@Schema({ _id: false })
export class KycReviewData {
  @Prop({ trim: true })
  enteredCnic?: string;

  @Prop({ trim: true })
  ocrExtractedCnic?: string;

  @Prop({ trim: true })
  ocrExtractedName?: string;

  @Prop()
  ocrRawText?: string;

  @Prop()
  ocrMatched?: boolean;

  @Prop({ type: Number, min: 0, max: 100 })
  faceMatchScore?: number;

  @Prop()
  faceMatchPassed?: boolean;

  /** auto_pass_pending_admin | manual_review_required */
  @Prop({ trim: true })
  reviewMode?: string;

  @Prop()
  checkedAt?: Date;
}
export const KycReviewDataSchema = SchemaFactory.createForClass(KycReviewData);

@Schema({ _id: false })
export class CitizenProfile {
  @Prop({ trim: true })
  fullName?: string;

  @Prop({ trim: true })
  phoneNumber?: string;

  @Prop({ trim: true })
  cnic?: string;

  @Prop({ trim: true })
  country?: string;

  @Prop({ trim: true })
  city?: string;

  @Prop({ trim: true })
  address?: string;

  // Optional proof docs (CNIC front/back)
  @Prop({ type: [String], default: [] })
  identityDocumentUrls?: string[];

  @Prop({ type: String, default: null })
  verificationStatus?: string | null;

  @Prop()
  verificationSubmittedAt?: Date;

  @Prop()
  verifiedAt?: Date;

  @Prop()
  verificationRejectionReason?: string;

  @Prop({ type: KycReviewDataSchema, default: null })
  kycReview?: KycReviewData | null;
}
export const CitizenProfileSchema = SchemaFactory.createForClass(CitizenProfile);

@Schema({ _id: false })
export class AvailabilitySlot {
  @Prop({ required: true })
  day: string; // 'monday', 'tuesday', etc.

  @Prop({ required: true })
  startTime: string; // "09:00"

  @Prop({ required: true })
  endTime: string; // "17:00"

  @Prop({ default: true })
  isAvailable: boolean;
}
export const AvailabilitySlotSchema = SchemaFactory.createForClass(AvailabilitySlot);

@Schema({ _id: false })
export class LawyerProfile {
  @Prop({ trim: true })
  fullName?: string;

  @Prop({ trim: true })
  phoneNumber?: string;

  @Prop({ trim: true })
  cnic?: string;

  @Prop({ trim: true })
  city?: string;

  @Prop({ type: Number })
  latitude?: number;

  @Prop({ type: Number })
  longitude?: number;

  @Prop({ trim: true })
  country?: string;

  @Prop({ type: [String], default: [] })
  practiceAreas?: string[]; // categories/specialties

  @Prop({ min: 0 })
  yearsOfExperience?: number;

  @Prop({ trim: true })
  barCouncilNumber?: string;

  @Prop({ trim: true })
  officeAddress?: string;

  @Prop({ trim: true })
  bio?: string;

  // Profile picture
  @Prop({ trim: true })
  profilePictureUrl?: string;

  // Consultation settings
  @Prop({ default: 0, min: 0 })
  consultationFee?: number; // Fee per consultation in PKR

  @Prop({ default: 30, min: 15 })
  consultationDuration?: number; // Default duration in minutes

  @Prop({ default: true })
  acceptsOnlineConsultation?: boolean;

  @Prop({ default: true })
  acceptsInPersonConsultation?: boolean;

  // Availability schedule
  @Prop({ type: [AvailabilitySlotSchema], default: [] })
  availability?: AvailabilitySlot[];

  // Rating & Reviews
  @Prop({ default: 0, min: 0, max: 5 })
  averageRating?: number;

  @Prop({ default: 0 })
  totalReviews?: number;

  @Prop({ default: 0 })
  totalConsultations?: number;

  // Docs for verification (bar card, license, CNIC, etc.)
  @Prop({ type: [String], default: [] })
  verificationDocumentUrls?: string[];

  @Prop({ 
    type: String,
    default: null 
  })
  verificationStatus?: string | null;

  @Prop()
  verificationSubmittedAt?: Date;

  @Prop()
  verifiedAt?: Date;

  @Prop()
  verificationRejectionReason?: string;

  @Prop({ type: KycReviewDataSchema, default: null })
  kycReview?: KycReviewData | null;

  // Languages spoken
  @Prop({ type: [String], default: ['Urdu', 'English'] })
  languages?: string[];

  // Education
  @Prop({ trim: true })
  education?: string;

  // Court bar associations
  @Prop({ type: [String], default: [] })
  courtAssociations?: string[];

  @Prop({ type: PayoutAccountSchema, default: null })
  payoutAccount?: PayoutAccount | null;

  /** Denormalized subscription tier for search/display (synced on activate/expire). */
  @Prop({ type: String, enum: ['free', 'professional', 'premium'], default: 'free' })
  subscriptionTier?: 'free' | 'professional' | 'premium';

  @Prop({ type: Date, default: null })
  subscriptionExpiresAt?: Date | null;

  @Prop({ type: String, enum: ['professional', 'premium'], default: null })
  subscriptionBadge?: 'professional' | 'premium' | null;
}
export const LawyerProfileSchema = SchemaFactory.createForClass(LawyerProfile);

@Schema({ timestamps: true })
export class User {
  // ---------- Auth Core ----------
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  // Keep as "password" to avoid breaking existing service code (bcrypt hash stored here)
  @Prop({ required: true })
  password: string;

  @Prop({ type: String, enum: Object.values(UserRole), default: UserRole.CITIZEN })
  role: UserRole;

  @Prop({ default: true })
  isActive: boolean;

  // ---------- Verification / Security ----------
  @Prop({ default: false })
  emailVerified: boolean;

  @Prop({ type: String, default: null })
  verificationCode: string | null;

  @Prop({ type: Date, default: null })
  verificationCodeExpiry: Date | null;

  @Prop({ type: String, default: null })
  loginOtpCode: string | null;

  @Prop({ type: Date, default: null })
  loginOtpExpiry: Date | null;

  // Optional: to enforce max attempts (aap ki requirement me max 3)
  @Prop({ type: Number, default: 0 })
  loginOtpAttempts: number;

  @Prop({ type: String, default: null })
  passwordResetCode: string | null;

  @Prop({ type: Date, default: null })
  passwordResetExpiry: Date | null;

  @Prop({ type: String, default: null })
  updatePasswordToken?: string | null;

  @Prop({ type: Date, default: null })
  updatePasswordExpires?: Date | null;

  @Prop({ default: false })
  skipNextLoginOtp?: boolean;

  /** One-time Rs. 2000 registration fee (lawyers only). `false` = must pay before account is active. */
  @Prop({ type: Boolean, default: undefined })
  lawyerRegistrationFeePaid?: boolean;

  @Prop({ type: Date, default: null })
  lawyerRegistrationPaidAt?: Date | null;

  // ---------- Profile Completion ----------
  @Prop({ default: false })
  isProfileComplete: boolean;

  // Citizen + Lawyer profiles
  @Prop({ type: CitizenProfileSchema, default: null })
  citizenProfile?: CitizenProfile | null;

  @Prop({ type: LawyerProfileSchema, default: null })
  lawyerProfile?: LawyerProfile | null;

  // Payment info (both can have it; lawyer needs for payouts, citizen for payments preference)
  @Prop({ type: PaymentInfoSchema, default: null })
  paymentInfo?: PaymentInfo | null;

  // UC-08: Notification preferences
  @Prop({
    type: Object,
    default: () => ({ inApp: true, email: true, sms: true }),
  })
  notificationPreferences?: { inApp?: boolean; email?: boolean; sms?: boolean };
}

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.index({ 'lawyerProfile.latitude': 1, 'lawyerProfile.longitude': 1 });
