// User types
export const UserRole = {
  CITIZEN: 'citizen',
  LAWYER: 'lawyer',
  ADMIN: 'admin',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const VerificationStatus = {
  PENDING: 'pending',
  VERIFIED: 'verified',
  REJECTED: 'rejected',
} as const;
export type VerificationStatus = (typeof VerificationStatus)[keyof typeof VerificationStatus];

export interface PaymentInfo {
  methodType?: 'jazzcash' | 'easypaisa' | 'card' | 'bank' | null;
  accountTitle?: string;
  accountIdentifier?: string;
  isVerified: boolean;
  verifiedAt?: string;
}

export interface CitizenProfile {
  fullName?: string;
  phoneNumber?: string;
  cnic?: string;
  country?: string;
  city?: string;
  address?: string;
  identityDocumentUrls?: string[];
  verificationStatus?: VerificationStatus;
  verificationSubmittedAt?: string;
  verifiedAt?: string;
  verificationRejectionReason?: string;
  kycReview?: KycReviewData;
}

export interface AvailabilitySlot {
  day: string;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
}

export interface PayoutAccount {
  method?: 'bank' | 'jazzcash' | 'easypaisa' | null;
  accountTitle?: string;
  bankName?: string;
  accountNumber?: string;
  iban?: string;
  mobileNumber?: string;
  updatedAt?: string;
}

export interface LawyerProfile {
  fullName?: string;
  phoneNumber?: string;
  cnic?: string;
  city?: string;
  country?: string;
  practiceAreas?: string[];
  yearsOfExperience?: number;
  barCouncilNumber?: string;
  officeAddress?: string;
  bio?: string;
  profilePictureUrl?: string;
  consultationFee?: number;
  consultationDuration?: number;
  acceptsOnlineConsultation?: boolean;
  acceptsInPersonConsultation?: boolean;
  availability?: AvailabilitySlot[];
  averageRating?: number;
  totalReviews?: number;
  totalConsultations?: number;
  verificationDocumentUrls?: string[];
  verificationStatus?: VerificationStatus;
  verificationSubmittedAt?: string;
  verifiedAt?: string;
  verificationRejectionReason?: string;
  kycReview?: KycReviewData;
  languages?: string[];
  education?: string;
  courtAssociations?: string[];
  payoutAccount?: PayoutAccount | null;
}

/** Public lawyer search / profile payload (citizen-facing; no subscription fields). */
export interface PublicLawyerResult {
  _id: string;
  lawyerProfile?: LawyerProfile | null;
  distanceKm?: number | null;
}

export interface User {
  _id: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  emailVerified: boolean;
  /** false = must pay one-time registration fee (lawyers only) */
  lawyerRegistrationFeePaid?: boolean;
  isProfileComplete: boolean;
  citizenProfile?: CitizenProfile | null;
  lawyerProfile?: LawyerProfile | null;
  paymentInfo?: PaymentInfo | null;
  createdAt: string;
  updatedAt: string;
}

// Appointment types
export const AppointmentStatus = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  CANCELLED: 'cancelled',
  COMPLETED: 'completed',
  NO_SHOW: 'no_show',
  RESCHEDULED: 'rescheduled',
} as const;
export type AppointmentStatus = (typeof AppointmentStatus)[keyof typeof AppointmentStatus];

export const ConsultationType = {
  ONLINE: 'online',
  IN_PERSON: 'in_person',
  PHONE: 'phone',
} as const;
export type ConsultationType = (typeof ConsultationType)[keyof typeof ConsultationType];

export interface Appointment {
  _id: string;
  citizenId: string | User;
  lawyerId: string | User;
  appointmentDate: string;
  startTime: string;
  endTime: string;
  duration: number;
  consultationType: ConsultationType;
  status: AppointmentStatus;
  description?: string;
  caseCategory?: string;
  fee: number;
  isPaid: boolean;
  paymentId?: string;
  meetingLink?: string;
  meetingPassword?: string;
  location?: string;
  lawyerNotes?: string;
  cancellationReason?: string;
  cancelledBy?: string;
  cancelledAt?: string;
  originalDate?: string;
  originalStartTime?: string;
  rescheduleReason?: string;
  rescheduledBy?: string;
  hasReview: boolean;
  createdAt: string;
  updatedAt: string;
}

// Review types
export interface Review {
  _id: string;
  citizenId: string | User;
  lawyerId: string | User;
  appointmentId?: string;
  rating: number;
  comment?: string;
  isVisible: boolean;
  adminNote?: string;
  createdAt: string;
  updatedAt: string;
}

// Message types
export interface Attachment {
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
}

export interface Message {
  _id: string;
  senderId: string | User;
  receiverId: string | User;
  conversationId: string;
  content?: string;
  attachments: Attachment[];
  isRead: boolean;
  readAt?: string;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Conversation {
  conversationId: string;
  otherParticipant: User;
  lastMessage?: string;
  lastMessageAt?: string;
  unreadCount: number;
}

// Payment types
export const PaymentMethod = {
  JAZZCASH: 'jazzcash',
  EASYPAISA: 'easypaisa',
  CARD: 'card',
  BANK_TRANSFER: 'bank_transfer',
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const PaymentStatus = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  REFUNDED: 'refunded',
  CANCELLED: 'cancelled',
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export interface Payment {
  _id: string;
  citizenId: string | User;
  lawyerId: string | User;
  appointmentId?: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
  status: PaymentStatus;
  transactionId?: string;
  referenceNumber?: string;
  description?: string;
  platformFeePercent: number;
  platformFeeAmount: number;
  lawyerAmount: number;
  completedAt?: string;
  refundedAt?: string;
  refundReason?: string;
  createdAt: string;
  updatedAt: string;
}

// Notification types
export const NotificationType = {
  APPOINTMENT_BOOKED: 'appointment_booked',
  APPOINTMENT_CONFIRMED: 'appointment_confirmed',
  APPOINTMENT_CANCELLED: 'appointment_cancelled',
  APPOINTMENT_RESCHEDULED: 'appointment_rescheduled',
  APPOINTMENT_REMINDER: 'appointment_reminder',
  APPOINTMENT_COMPLETED: 'appointment_completed',
  PAYMENT_RECEIVED: 'payment_received',
  PAYMENT_SENT: 'payment_sent',
  PAYMENT_FAILED: 'payment_failed',
  REFUND_PROCESSED: 'refund_processed',
  VERIFICATION_SUBMITTED: 'verification_submitted',
  VERIFICATION_APPROVED: 'verification_approved',
  VERIFICATION_REJECTED: 'verification_rejected',
  NEW_REVIEW: 'new_review',
  REVIEW_REPLY: 'review_reply',
  NEW_MESSAGE: 'new_message',
  SYSTEM_ANNOUNCEMENT: 'system_announcement',
  ACCOUNT_UPDATE: 'account_update',
} as const;
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];

export interface Notification {
  _id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, any>;
  isRead: boolean;
  readAt?: string;
  actionUrl?: string;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

// Category type
export interface Category {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  isActive: boolean;
  lawyerCount: number;
  order: number;
}

// Identity document types
export const DocumentType = {
  CNIC: 'cnic',
  CNIC_FRONT: 'cnic_front',
  CNIC_BACK: 'cnic_back',
  SELFIE: 'selfie',
  BAR_CERTIFICATE: 'bar_certificate',
  LICENSE: 'license',
  DEGREE: 'degree',
  OTHER: 'other',
} as const;
export type DocumentType = (typeof DocumentType)[keyof typeof DocumentType];

export const DocumentStatus = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
} as const;
export type DocumentStatus = (typeof DocumentStatus)[keyof typeof DocumentStatus];

export interface KycReviewData {
  enteredCnic?: string;
  ocrExtractedCnic?: string | null;
  ocrExtractedName?: string | null;
  ocrRawText?: string;
  ocrMatched?: boolean;
  faceMatchScore?: number;
  faceMatchPassed?: boolean;
  reviewMode?: 'auto_pass_pending_admin' | 'manual_review_required';
  checkedAt?: string;
}

export interface IdentityDocument {
  _id: string;
  userId: string;
  documentType: DocumentType;
  fileUrl: string;
  status: DocumentStatus;
  uploadedAt: string;
  reviewedAt?: string;
  rejectionReason?: string;
}

// API Response types
export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
