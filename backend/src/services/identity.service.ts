import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument, VerificationStatus } from '../schemas/user.schema';
import { IdentityDocument, IdentityDocumentDocument, DocumentType } from '../schemas/identity.schema';
import { NotificationService } from './notification.service';
import { NotificationType } from '../schemas/notification.schema';
import { StorageService } from './storage.service';
import { KycVerificationService } from './kyc-verification.service';

const IMAGE_ONLY_TYPES = new Set<DocumentType>([
  DocumentType.CNIC_FRONT,
  DocumentType.CNIC_BACK,
  DocumentType.SELFIE,
]);

@Injectable()
export class IdentityService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(IdentityDocument.name) private identityDocumentModel: Model<IdentityDocumentDocument>,
    private notificationService: NotificationService,
    private storageService: StorageService,
    private kycVerificationService: KycVerificationService,
  ) {}

  private normalizeDocumentType(raw: string): DocumentType | null {
    const v = String(raw || '')
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_');
    if (v === 'cnic' || v === 'cnic_front') return DocumentType.CNIC_FRONT;
    if (v === 'cnic_back') return DocumentType.CNIC_BACK;
    if (v === 'selfie' || v === 'live_selfie') return DocumentType.SELFIE;
    if (v === 'bar_certificate' || v === 'barcouncilcertificate') return DocumentType.BAR_CERTIFICATE;
    if (v === 'license') return DocumentType.LICENSE;
    if (v === 'degree') return DocumentType.DEGREE;
    if (v === 'other') return DocumentType.OTHER;
    return null;
  }

  private profilePath(role: string): 'citizenProfile' | 'lawyerProfile' | null {
    if (role === 'citizen') return 'citizenProfile';
    if (role === 'lawyer') return 'lawyerProfile';
    return null;
  }

  /** Mongoose cannot set nested fields when profile subdocument is null — merge via save(). */
  private async patchUserProfile(userId: string, role: string, patch: Record<string, unknown>) {
    const user = await this.userModel.findById(userId);
    if (!user) return;

    if (role === 'lawyer') {
      user.lawyerProfile = {
        ...((user.lawyerProfile as Record<string, unknown>) || {}),
        ...patch,
      } as typeof user.lawyerProfile;
      user.markModified('lawyerProfile');
    } else if (role === 'citizen') {
      user.citizenProfile = {
        ...((user.citizenProfile as Record<string, unknown>) || {}),
        ...patch,
      } as typeof user.citizenProfile;
      user.markModified('citizenProfile');
    }
    await user.save();
  }

  private getProfileCnic(user: UserDocument): string {
    if (user.role === 'lawyer') return user.lawyerProfile?.cnic || '';
    if (user.role === 'citizen') return user.citizenProfile?.cnic || '';
    return '';
  }

  private getVerificationStatus(user: UserDocument): string | null {
    if (user.role === 'lawyer') return user.lawyerProfile?.verificationStatus || null;
    if (user.role === 'citizen') return user.citizenProfile?.verificationStatus || null;
    return null;
  }

  async uploadDocument(
    userId: string,
    documentType: DocumentType,
    file: {
      fileUrl: string;
      filename: string;
      originalName?: string;
      mimeType?: string;
      size?: number;
      cloudinaryPublicId?: string;
      secureUrl?: string;
    },
  ) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    if (user.role !== 'citizen' && user.role !== 'lawyer') {
      throw new HttpException('Only citizens and lawyers can upload verification documents', HttpStatus.FORBIDDEN);
    }

    if (documentType === DocumentType.BAR_CERTIFICATE && user.role === 'lawyer') {
      const kyc = this.getKycReview(user);
      if (!kyc?.ocrMatched || !kyc?.faceMatchPassed) {
        throw new HttpException(
          'Complete identity check (CNIC + face match on your card and selfie) before uploading Bar Council documents.',
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    const status = this.getVerificationStatus(user);
    if (status === VerificationStatus.PENDING || status === VerificationStatus.VERIFIED) {
      throw new HttpException('Documents are locked while verification is pending or approved', HttpStatus.BAD_REQUEST);
    }

    // Replace existing pending doc of same type
    const existingPending = await this.identityDocumentModel.findOne({
      userId,
      documentType,
      status: 'pending',
    });
    if (existingPending) {
      await this.storageService.deleteStoredFile(existingPending.fileUrl, existingPending.cloudinaryPublicId);
      await this.identityDocumentModel.deleteOne({ _id: existingPending._id });
    }

    const existingApproved = await this.identityDocumentModel.findOne({
      userId,
      documentType,
      status: 'approved',
    });
    if (existingApproved) {
      throw new HttpException(
        `An approved ${documentType} document already exists. Contact support to update.`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const document = new this.identityDocumentModel({
      userId,
      documentType,
      fileUrl: file.fileUrl,
      filename: file.filename,
      originalName: file.originalName,
      mimeType: file.mimeType,
      size: file.size,
      cloudinaryPublicId: file.cloudinaryPublicId,
      secureUrl: file.secureUrl || file.fileUrl,
      status: 'pending',
      uploadedAt: new Date(),
    });

    await document.save();

    const profileKey = this.profilePath(user.role);
    if (
      profileKey &&
      [DocumentType.CNIC_FRONT, DocumentType.CNIC_BACK, DocumentType.SELFIE, DocumentType.CNIC].includes(
        documentType,
      )
    ) {
      await this.patchUserProfile(userId, user.role, { kycReview: null });
    }

    return {
      success: true,
      document: {
        _id: document._id,
        documentType: document.documentType,
        fileUrl: document.fileUrl,
        status: document.status,
        uploadedAt: document.uploadedAt,
      },
    };
  }

  isImageOnlyDocumentType(documentType: DocumentType): boolean {
    return IMAGE_ONLY_TYPES.has(documentType);
  }

  async getUserDocuments(userId: string) {
    const documents = await this.identityDocumentModel
      .find({ userId })
      .sort({ uploadedAt: -1 })
      .select(
        '_id documentType fileUrl secureUrl cloudinaryPublicId originalName mimeType size status uploadedAt rejectionReason reviewedAt reviewedBy',
      );

    const user = await this.userModel
      .findById(userId)
      .select(
        'role citizenProfile.verificationStatus citizenProfile.verificationRejectionReason citizenProfile.kycReview lawyerProfile.verificationStatus lawyerProfile.verificationRejectionReason lawyerProfile.kycReview',
      );

    const verificationStatus =
      user?.role === 'lawyer'
        ? user.lawyerProfile?.verificationStatus || null
        : user?.role === 'citizen'
          ? user.citizenProfile?.verificationStatus || null
          : null;
    const rejectionReason =
      user?.role === 'lawyer'
        ? user.lawyerProfile?.verificationRejectionReason
        : user?.citizenProfile?.verificationRejectionReason;
    const kycReview =
      user?.role === 'lawyer'
        ? user.lawyerProfile?.kycReview
        : user?.citizenProfile?.kycReview;

    return {
      success: true,
      documents,
      verificationStatus,
      rejectionReason,
      kycReview,
      role: user?.role,
    };
  }

  async deleteDocument(userId: string, documentId: string) {
    const document = await this.identityDocumentModel.findOne({
      _id: documentId,
      userId,
    });

    if (!document) {
      throw new HttpException('Document not found', HttpStatus.NOT_FOUND);
    }

    if (document.status !== 'pending') {
      throw new HttpException('Cannot delete approved or rejected documents', HttpStatus.BAD_REQUEST);
    }

    await this.identityDocumentModel.deleteOne({ _id: documentId });
    await this.storageService.deleteStoredFile(document.fileUrl, document.cloudinaryPublicId);

    return { success: true, message: 'Document deleted successfully' };
  }

  private async collectPendingDoc(userId: string, type: DocumentType) {
    const doc = await this.identityDocumentModel.findOne({ userId, documentType: type, status: 'pending' });
    // Legacy single CNIC file
    if (!doc && type === DocumentType.CNIC_FRONT) {
      return this.identityDocumentModel.findOne({ userId, documentType: DocumentType.CNIC, status: 'pending' });
    }
    return doc;
  }

  private getKycReview(user: UserDocument) {
    if (user.role === 'lawyer') return user.lawyerProfile?.kycReview;
    if (user.role === 'citizen') return user.citizenProfile?.kycReview;
    return null;
  }

  private async runAutomatedChecks(user: UserDocument) {
    const userId = user._id.toString();
    const profileKey = this.profilePath(user.role)!;
    const enteredCnic = this.getProfileCnic(user).trim();
    if (!enteredCnic) {
      throw new HttpException('Add your CNIC number in profile before verification', HttpStatus.BAD_REQUEST);
    }

    const cnicFront = await this.collectPendingDoc(userId, DocumentType.CNIC_FRONT);
    const cnicBack = await this.collectPendingDoc(userId, DocumentType.CNIC_BACK);
    const selfie = await this.collectPendingDoc(userId, DocumentType.SELFIE);

    const missing: string[] = [];
    if (!cnicFront) missing.push('cnic_front');
    if (!cnicBack) missing.push('cnic_back');
    if (!selfie) missing.push('selfie');
    if (missing.length > 0) {
      throw new HttpException(`Upload required first: ${missing.join(', ')}`, HttpStatus.BAD_REQUEST);
    }

    const kycResult = await this.kycVerificationService.verifyIdentity({
      enteredCnic,
      cnicFrontUrl: cnicFront!.fileUrl || cnicFront!.secureUrl!,
      selfieUrl: selfie!.fileUrl || selfie!.secureUrl!,
    });

    if (!kycResult.ocrMatched) {
      const readCnic = kycResult.ocrExtractedCnic;
      throw new HttpException(
        readCnic
          ? 'CNIC mismatch. Re-enter the number printed on your card and run the check again.'
          : 'Could not read CNIC from your card photo. Re-enter your CNIC or upload a clearer CNIC front, then try again.',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!kycResult.faceMatchPassed) {
      const score = kycResult.faceMatchScore ?? 0;
      let hint =
        ' Retake a clear CNIC front (portrait visible, not blurry) and a live selfie facing the camera.';
      if (score === 0) {
        hint +=
          ' If CNIC portrait is small, re-upload a sharper CNIC photo. Backend: npm run setup:kyc if models missing.';
      }
      throw new HttpException(
        `Live selfie verification failed (face match ${score}%, need ${50}%+). Your face on the selfie must match the portrait on your CNIC card — use your own card and selfie.${hint}`,
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.patchUserProfile(userId, user.role, { kycReview: kycResult });

    return kycResult;
  }

  private async finalizeCitizenAutoVerification(userId: string, kycResult: Record<string, unknown>) {
    await this.patchUserProfile(userId, 'citizen', {
      verificationStatus: VerificationStatus.VERIFIED,
      verificationSubmittedAt: new Date(),
      verifiedAt: new Date(),
      verificationRejectionReason: null,
      kycReview: kycResult,
    });

    await this.identityDocumentModel.updateMany(
      { userId, status: 'pending' },
      { status: VerificationStatus.VERIFIED, reviewedAt: new Date() },
    );

    await this.notificationService.createVerificationNotification(userId, 'approved');
  }

  private formatCnicDigits(digits: string): string | null {
    const d = digits.replace(/\D/g, '');
    if (d.length !== 13) return null;
    return `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}`;
  }

  async runAutomatedKycCheck(userId: string, bodyCnic?: string) {
    let user = await this.userModel.findById(userId);
    if (!user || (user.role !== 'lawyer' && user.role !== 'citizen')) {
      throw new HttpException('User not found or role cannot run KYC check', HttpStatus.NOT_FOUND);
    }

    const currentStatus = this.getVerificationStatus(user);
    if (currentStatus === VerificationStatus.PENDING) {
      throw new HttpException('Verification is already pending admin review', HttpStatus.BAD_REQUEST);
    }
    if (currentStatus === VerificationStatus.VERIFIED) {
      throw new HttpException('Your account is already verified', HttpStatus.BAD_REQUEST);
    }

    const rawCnic = String(bodyCnic || '').trim();
    if (rawCnic) {
      const formatted = this.formatCnicDigits(rawCnic) || rawCnic;
      await this.patchUserProfile(userId, user.role, { cnic: formatted });
      user = await this.userModel.findById(userId);
      if (!user) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }
    }

    const kycResult = await this.runAutomatedChecks(user);

    if (user.role === 'citizen') {
      await this.finalizeCitizenAutoVerification(userId, kycResult as Record<string, unknown>);
      return {
        success: true,
        message: 'Identity verified successfully via automated CNIC verification',
        verified: true,
        kycReview: kycResult,
      };
    }

    return {
      success: true,
      message: 'CNIC OCR and face verification passed',
      kycReview: kycResult,
    };
  }

  async submitVerificationRequest(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user || (user.role !== 'lawyer' && user.role !== 'citizen')) {
      throw new HttpException('User not found or role cannot submit KYC', HttpStatus.NOT_FOUND);
    }

    const profileKey = this.profilePath(user.role)!;
    const enteredCnic = this.getProfileCnic(user).trim();
    if (!enteredCnic) {
      throw new HttpException('Add your CNIC number in profile before submitting verification', HttpStatus.BAD_REQUEST);
    }

    const cnicFront = await this.collectPendingDoc(userId, DocumentType.CNIC_FRONT);
    const cnicBack = await this.collectPendingDoc(userId, DocumentType.CNIC_BACK);
    const selfie = await this.collectPendingDoc(userId, DocumentType.SELFIE);

    const missing: string[] = [];
    if (!cnicFront) missing.push('cnic_front');
    if (!cnicBack) missing.push('cnic_back');
    if (!selfie) missing.push('selfie');

    if (user.role === 'lawyer') {
      const barCertificate = await this.collectPendingDoc(userId, DocumentType.BAR_CERTIFICATE);
      if (!barCertificate) missing.push('bar_certificate');
    }

    if (missing.length > 0) {
      throw new HttpException(`Missing required documents: ${missing.join(', ')}`, HttpStatus.BAD_REQUEST);
    }

    const currentStatus = this.getVerificationStatus(user);
    if (currentStatus === VerificationStatus.PENDING) {
      throw new HttpException('Verification request is already pending review', HttpStatus.BAD_REQUEST);
    }
    if (currentStatus === VerificationStatus.VERIFIED) {
      throw new HttpException('Your account is already verified', HttpStatus.BAD_REQUEST);
    }

    let kycResult = this.getKycReview(user) as any;
    if (!kycResult?.ocrMatched || !kycResult?.faceMatchPassed) {
      kycResult = await this.runAutomatedChecks(user);
    }

    // Citizen identity is fully automated (OCR + face match). No admin queue.
    if (user.role === 'citizen') {
      await this.finalizeCitizenAutoVerification(userId, kycResult as Record<string, unknown>);
      return {
        success: true,
        message: 'Identity verified successfully via automated CNIC verification',
        kycReview: kycResult,
      };
    }

    await this.patchUserProfile(userId, user.role, {
      verificationStatus: VerificationStatus.PENDING,
      verificationSubmittedAt: new Date(),
      verificationRejectionReason: null,
      kycReview: kycResult,
    });

    const displayName =
      user.role === 'lawyer'
        ? user.lawyerProfile?.fullName || user.email
        : user.citizenProfile?.fullName || user.email;

    await this.notificationService.notifyAdmins(
      `New ${user.role} verification request`,
      `${displayName} submitted identity documents for review`,
      '/admin/verifications',
    );
    await this.notificationService.createVerificationNotification(userId, 'submitted');

    return {
      success: true,
      message: 'Verification request submitted successfully',
      kycReview: kycResult,
    };
  }

  async getPendingVerifications() {
    const users = await this.userModel
      .find({
        role: 'lawyer',
        'lawyerProfile.verificationStatus': VerificationStatus.PENDING,
      })
      .select(
        '_id email role lawyerProfile.fullName lawyerProfile.phoneNumber lawyerProfile.cnic lawyerProfile.barCouncilNumber lawyerProfile.verificationSubmittedAt',
      )
      .sort({ 'lawyerProfile.verificationSubmittedAt': -1 });

    const verifications = await Promise.all(
      users.map(async (user) => {
        const documents = await this.identityDocumentModel
          .find({
            userId: user._id.toString(),
            status: 'pending',
            documentType: { $nin: [DocumentType.SELFIE, DocumentType.CNIC] },
          })
          .select('documentType fileUrl secureUrl originalName mimeType size uploadedAt');

        const isLawyer = user.role === 'lawyer';
        const profile = isLawyer ? user.lawyerProfile : user.citizenProfile;

        return {
          userId: user._id,
          role: user.role,
          email: user.email,
          fullName: profile?.fullName,
          phoneNumber: profile?.phoneNumber,
          cnic: profile?.cnic,
          barCouncilNumber: isLawyer ? user.lawyerProfile?.barCouncilNumber : undefined,
          submittedAt: isLawyer
            ? user.lawyerProfile?.verificationSubmittedAt
            : user.citizenProfile?.verificationSubmittedAt,
          documents,
        };
      }),
    );

    return { success: true, verifications };
  }

  async reviewVerification(
    userId: string,
    adminId: string,
    action: 'approve' | 'reject',
    rejectionReason?: string,
  ) {
    const user = await this.userModel.findById(userId);
    if (!user || user.role !== 'lawyer') {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    const profileKey = this.profilePath(user.role)!;
    const currentStatus = this.getVerificationStatus(user);
    if (currentStatus !== VerificationStatus.PENDING) {
      throw new HttpException('Verification is not pending', HttpStatus.BAD_REQUEST);
    }

    const newStatus = action === 'approve' ? VerificationStatus.VERIFIED : VerificationStatus.REJECTED;
    await this.patchUserProfile(userId, user.role, {
      verificationStatus: newStatus,
      verifiedAt: action === 'approve' ? new Date() : undefined,
      verificationRejectionReason: action === 'reject' ? rejectionReason : undefined,
    });

    await this.identityDocumentModel.updateMany(
      { userId, status: 'pending' },
      { status: newStatus, reviewedAt: new Date(), reviewedBy: adminId },
    );

    const title = action === 'approve' ? 'Verification Approved' : 'Verification Rejected';
    const message =
      action === 'approve'
        ? 'Your identity verification has been approved.'
        : `Your verification was rejected. Reason: ${rejectionReason}`;

    const profilePath =
      user.role === 'lawyer' ? '/lawyer/profile?tab=kyc' : '/client/profile?tab=kyc';

    await this.notificationService.createNotification(
      userId,
      action === 'approve' ? NotificationType.VERIFICATION_APPROVED : NotificationType.VERIFICATION_REJECTED,
      title,
      message,
      {},
      profilePath,
    );

    return {
      success: true,
      message: `Verification ${action}d successfully`,
      newStatus,
    };
  }
}
