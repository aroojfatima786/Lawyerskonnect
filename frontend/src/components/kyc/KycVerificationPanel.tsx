import { useEffect, useMemo, useState } from 'react';
import {
  FiUpload,
  FiCheckCircle,
  FiXCircle,
  FiAlertCircle,
  FiCamera,
  FiChevronLeft,
  FiChevronRight,
  FiShield,
} from 'react-icons/fi';
import { identityApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import {
  formatCnicInput,
  validateCnic,
  CNIC_FORMAT_HINT,
  isCnicMismatchError,
  normalizeKycCheckError,
} from '../../utils/cnic';
import { MAX_KYC_FILE_BYTES, MAX_KYC_FILE_LABEL } from '../../constants/uploadLimits';
import { Card, CardHeader, Button, Badge, Input } from '../ui';
import { useToast } from '../ui/Toast';
import { DocumentType, DocumentStatus, VerificationStatus } from '../../types';
import type { IdentityDocument, KycReviewData } from '../../types';
import { LivenessSelfieModal } from './LivenessSelfieModal';

function normalizeDocumentType(raw: string): DocumentType | null {
  const v = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (v === 'cnic' || v === 'cnic_front') return DocumentType.CNIC_FRONT;
  if (v === 'cnic_back') return DocumentType.CNIC_BACK;
  if (v === 'selfie') return DocumentType.SELFIE;
  if (v === 'bar_certificate') return DocumentType.BAR_CERTIFICATE;
  return null;
}

type WizardStepId = 'cnic_front' | 'cnic_back' | 'selfie' | 'verify' | 'bar_certificate' | 'submit';

type Props = {
  isLawyer: boolean;
  verificationStatus?: VerificationStatus | null;
  rejectionReason?: string | null;
  onRefreshUser?: () => Promise<void>;
};

function automatedPassed(kyc: KycReviewData | null) {
  return Boolean(kyc?.ocrMatched && kyc?.faceMatchPassed);
}

export function KycVerificationPanel({ isLawyer, verificationStatus, rejectionReason, onRefreshUser }: Props) {
  const toast = useToast();
  const { user } = useAuth();
  const profileCnic = isLawyer ? user?.lawyerProfile?.cnic : user?.citizenProfile?.cnic;
  const [documents, setDocuments] = useState<IdentityDocument[]>([]);
  const [kycReview, setKycReview] = useState<KycReviewData | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selfieOpen, setSelfieOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [cnicInput, setCnicInput] = useState('');

  useEffect(() => {
    setCnicInput(profileCnic?.trim() ? formatCnicInput(profileCnic) : '');
  }, [profileCnic]);

  const cnicMismatch = checkError ? isCnicMismatchError(checkError) : false;
  const cnicInputCheck = validateCnic(cnicInput);
  const cnicInputError = cnicInput.trim() && !cnicInputCheck.valid ? cnicInputCheck.message : undefined;

  const stepDefs = useMemo(() => {
    const base: { id: WizardStepId; title: string; subtitle: string }[] = [
      { id: 'cnic_front', title: 'CNIC front', subtitle: 'Upload the front side of your CNIC' },
      { id: 'cnic_back', title: 'CNIC back', subtitle: 'Upload the back side of your CNIC' },
      { id: 'selfie', title: 'Live selfie', subtitle: 'Complete liveness: look straight, turn head, look down' },
      { id: 'verify', title: 'Identity check', subtitle: 'OCR + face match runs automatically on this step' },
    ];
    if (isLawyer) {
      base.push({
        id: 'bar_certificate',
        title: 'Bar Council',
        subtitle: 'Upload your Bar Council license or certificate',
      });
      base.push({
        id: 'submit',
        title: 'Submit',
        subtitle: 'Send CNIC documents to admin for final approval',
      });
    }
    return base;
  }, [isLawyer]);

  const load = async () => {
    try {
      const response: any = await identityApi.getMyDocuments();
      const raw = response.documents ?? response.data?.documents ?? [];
      setDocuments(Array.isArray(raw) ? raw : []);
      setKycReview(response.kycReview ?? response.data?.kycReview ?? null);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const isUnderReview = verificationStatus === VerificationStatus.PENDING;
  const isVerified = verificationStatus === VerificationStatus.VERIFIED;
  const isRejected = verificationStatus === VerificationStatus.REJECTED;
  const uploadLocked = isUnderReview || isVerified;

  const pendingTypes = new Set(
    documents
      .filter((d) => d.status === DocumentStatus.PENDING)
      .map((d) => normalizeDocumentType(String(d.documentType)))
      .filter(Boolean) as DocumentType[],
  );

  const hasCnicFront = pendingTypes.has(DocumentType.CNIC_FRONT);
  const hasCnicBack = pendingTypes.has(DocumentType.CNIC_BACK);
  const hasSelfie = pendingTypes.has(DocumentType.SELFIE);
  const hasBar = pendingTypes.has(DocumentType.BAR_CERTIFICATE);
  const checksPassed = automatedPassed(kycReview);

  const computeSuggestedStep = () => {
    if (!hasCnicFront) return 0;
    if (!hasCnicBack) return 1;
    if (!hasSelfie) return 2;
    if (!checksPassed) return 3;
    if (isLawyer && !hasBar) return 4;
    return isLawyer ? 5 : 3;
  };

  const maxAllowedStep = computeSuggestedStep();

  useEffect(() => {
    if (!uploadLocked) setWizardStep(computeSuggestedStep());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasCnicFront, hasCnicBack, hasSelfie, checksPassed, hasBar, isLawyer, uploadLocked]);

  const current = stepDefs[wizardStep];

  const uploadFile = async (documentType: DocumentType, file: File) => {
    if (file.size > MAX_KYC_FILE_BYTES) {
      toast.error(`File too large. Max ${MAX_KYC_FILE_LABEL}.`);
      return;
    }
    const isReupload =
      (documentType === DocumentType.CNIC_FRONT && hasCnicFront) ||
      (documentType === DocumentType.CNIC_BACK && hasCnicBack) ||
      (documentType === DocumentType.BAR_CERTIFICATE && hasBar);

    setUploadingDoc(true);
    try {
      await identityApi.uploadDocument(documentType, file);
      if (documentType === DocumentType.SELFIE) {
        toast.success('Live selfie verified and uploaded');
      } else if (isReupload) {
        toast.success(
          documentType === DocumentType.CNIC_FRONT || documentType === DocumentType.CNIC_BACK
            ? 'CNIC photo replaced. Re-run identity check on Step 4 if you already completed it.'
            : 'Document replaced',
        );
      } else {
        toast.success('Document uploaded');
      }
      await load();
      await onRefreshUser?.();
      if (documentType === DocumentType.CNIC_FRONT && !hasCnicFront) setWizardStep(1);
      else if (documentType === DocumentType.CNIC_BACK && !hasCnicBack) setWizardStep(2);
      else if (documentType === DocumentType.BAR_CERTIFICATE && !hasBar) setWizardStep(isLawyer ? 5 : 4);
    } catch (err: any) {
      toast.error(err.message || 'Upload failed');
    } finally {
      setUploadingDoc(false);
    }
  };

  const runAutomatedCheck = async (cnicOverride?: string) => {
    const cnic = formatCnicInput(cnicOverride ?? cnicInput);
    const cnicValidation = validateCnic(cnic, { required: true });
    if (!cnicValidation.valid) {
      const msg = cnicValidation.message || 'Enter a valid 13-digit CNIC.';
      setCheckError(msg);
      toast.error(msg);
      return;
    }
    setCnicInput(cnic);
    setChecking(true);
    setCheckError(null);
    try {
      const res: any = await identityApi.runAutomatedCheck(cnic);
      const review = res.kycReview ?? res.data?.kycReview;
      if (!review?.ocrMatched || !review?.faceMatchPassed) {
        throw new Error('Identity check did not pass. Use your own CNIC and your own selfie.');
      }
      setKycReview(review);
      toast.success(
        isLawyer ? 'CNIC OCR and face verification passed' : 'Identity verified successfully',
      );
      await onRefreshUser?.();
      setWizardStep(isLawyer ? 4 : 3);
    } catch (err: any) {
      const msg = normalizeKycCheckError(err.message || 'Identity check failed');
      setCheckError(msg);
      toast.error(msg);
    } finally {
      setChecking(false);
    }
  };

  const handleSelfieCaptured = async (file: File) => {
    setKycReview(null);
    setCheckError(null);
    await uploadFile(DocumentType.SELFIE, file);
    setWizardStep(3);
    toast.success('Selfie saved. Step 4: run identity check (CNIC OCR + face match).');
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      await identityApi.submitVerification();
      toast.success('Submitted to admin for CNIC review');
      await onRefreshUser?.();
      await load();
    } catch (err: any) {
      toast.error(err.message || 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  };

  const statusBadge = () => {
    if (!verificationStatus) {
      return (
        <Badge variant="secondary" className="flex items-center gap-1">
          <FiAlertCircle /> {isLawyer ? 'Not submitted' : 'Not verified'}
        </Badge>
      );
    }
    if (verificationStatus === VerificationStatus.VERIFIED) {
      return (
        <Badge variant="success" className="flex items-center gap-1">
          <FiCheckCircle /> Verified
        </Badge>
      );
    }
    if (verificationStatus === VerificationStatus.REJECTED) {
      return (
        <Badge variant="danger" className="flex items-center gap-1">
          <FiXCircle /> Rejected
        </Badge>
      );
    }
    return (
      <Badge variant="warning" className="flex items-center gap-1">
        <FiAlertCircle /> Pending admin review
      </Badge>
    );
  };

  const imageUploadSlot = (
    label: string,
    type: DocumentType,
    accept = 'image/jpeg,image/png,image/webp',
    reupload = false,
  ) => (
    <label className="flex flex-col items-center justify-center w-full cursor-pointer rounded-lg border-2 border-dashed border-slate-200 p-6 transition hover:border-lk-accent hover:bg-blue-50/30">
      <input
        type="file"
        accept={accept}
        className="hidden"
        disabled={uploadingDoc || uploadLocked}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void uploadFile(type, file);
          e.target.value = '';
        }}
      />
      <FiUpload className="mb-2 text-lk-accent" size={24} />
      <span className="text-sm font-medium text-lk-accent">
        {uploadingDoc ? 'Uploading…' : reupload ? `Re-upload ${label}` : `Upload ${label}`}
      </span>
      <span className="mt-1 text-xs text-slate-500">
        {reupload ? 'Replace the current photo · ' : ''}JPG or PNG · max {MAX_KYC_FILE_LABEL}
      </span>
    </label>
  );

  const stepContent = () => {
    if (!current) return null;

    switch (current.id) {
      case 'cnic_front':
        return (
          <div className="space-y-4">
            {hasCnicFront && (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                CNIC front uploaded. Continue to the back side, or re-upload if the photo was unclear.
              </p>
            )}
            {imageUploadSlot('CNIC front', DocumentType.CNIC_FRONT, 'image/jpeg,image/png,image/webp', hasCnicFront)}
          </div>
        );
      case 'cnic_back':
        return (
          <div className="space-y-4">
            {hasCnicBack && (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                CNIC back uploaded. Continue to live selfie, or re-upload if the photo was unclear.
              </p>
            )}
            {imageUploadSlot('CNIC back', DocumentType.CNIC_BACK, 'image/jpeg,image/png,image/webp', hasCnicBack)}
          </div>
        );
      case 'selfie':
        return (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Camera only. You will follow 4 liveness poses: look straight, turn left, turn right, look down.
            </p>
            <Button
              type="button"
              className="w-full"
              variant="outline"
              disabled={uploadingDoc || checking || uploadLocked}
              onClick={() => setSelfieOpen(true)}
              leftIcon={<FiCamera />}
            >
              {hasSelfie ? 'Retake live selfie + liveness' : 'Start live selfie verification'}
            </Button>
            {hasSelfie && (
              <p className="text-sm font-medium text-emerald-700">Live selfie verified</p>
            )}
          </div>
        );
      case 'verify':
        return (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              We read your CNIC from the front photo and compare the <strong>CNIC portrait</strong> with your{' '}
              <strong>live selfie</strong> (same person required). Green on selfie only means liveness — not face match.
              You must pass this step before continuing.
            </p>
            {checksPassed && kycReview ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm space-y-1">
                <p className="font-semibold text-emerald-800 flex items-center gap-2">
                  <FiShield /> {isLawyer ? 'Automated checks passed' : 'Identity verified'}
                </p>
                <p>CNIC: {kycReview.ocrExtractedCnic || '—'} (matched from card OCR)</p>
                <p>Face match: {kycReview.faceMatchScore}%</p>
                {!isLawyer && (
                  <p className="text-emerald-700">Your account is verified. No admin submission needed.</p>
                )}
              </div>
            ) : (
              <>
                <Input
                  label="CNIC number (must match your card)"
                  name="kyc-cnic"
                  value={cnicInput}
                  onChange={(e) => setCnicInput(formatCnicInput(e.target.value))}
                  placeholder={CNIC_FORMAT_HINT}
                  inputMode="numeric"
                  autoComplete="off"
                  error={cnicInputError}
                  helperText={!cnicInputError ? `13 digits — ${CNIC_FORMAT_HINT}` : undefined}
                  disabled={checking || uploadLocked}
                />
                <Button
                  className="w-full"
                  onClick={() => void runAutomatedCheck()}
                  isLoading={checking}
                  disabled={!hasSelfie || !cnicInput.trim() || Boolean(cnicInputError)}
                >
                  {cnicMismatch ? 'Update CNIC & run check again' : 'Run identity check'}
                </Button>
                {checkError && (
                  <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                    {normalizeKycCheckError(checkError)}
                  </p>
                )}
              </>
            )}
          </div>
        );
      case 'bar_certificate':
        return (
          <div className="space-y-4">
            {!checksPassed && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                Identity check not passed. Go back to Step 4, use your own CNIC portrait and your own selfie, then
                run identity check.
              </p>
            )}
            {hasBar ? (
              <>
                <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  Bar Council certificate uploaded.
                </p>
                {checksPassed &&
                  imageUploadSlot(
                    'Bar Council certificate',
                    DocumentType.BAR_CERTIFICATE,
                    '.pdf,image/jpeg,image/png',
                    true,
                  )}
              </>
            ) : checksPassed ? (
              imageUploadSlot('Bar Council certificate', DocumentType.BAR_CERTIFICATE, '.pdf,image/jpeg,image/png')
            ) : null}
          </div>
        );
      case 'submit':
        return (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Admin will only review your CNIC{isLawyer ? ' and Bar Council certificate' : ''}. Selfie and OCR results
              stay private.
            </p>
            <ul className="text-sm text-slate-600 space-y-1 list-disc pl-5">
              <li className={hasCnicFront ? 'text-emerald-700' : ''}>CNIC front {hasCnicFront ? '✓' : '—'}</li>
              <li className={hasCnicBack ? 'text-emerald-700' : ''}>CNIC back {hasCnicBack ? '✓' : '—'}</li>
              <li className={hasSelfie ? 'text-emerald-700' : ''}>Live selfie {hasSelfie ? '✓' : '—'}</li>
              <li className={checksPassed ? 'text-emerald-700' : ''}>OCR + face {checksPassed ? '✓' : '—'}</li>
              {isLawyer && (
                <li className={hasBar ? 'text-emerald-700' : ''}>Bar Council {hasBar ? '✓' : '—'}</li>
              )}
            </ul>
            <Button
              className="w-full"
              onClick={() => void submit()}
              isLoading={submitting}
              disabled={
                !hasCnicFront ||
                !hasCnicBack ||
                !hasSelfie ||
                !checksPassed ||
                (isLawyer && !hasBar) ||
                uploadLocked
              }
            >
              Submit to admin
            </Button>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Verification status" />
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600">Status</span>
            {statusBadge()}
          </div>
          {isRejected && rejectionReason && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{rejectionReason}</p>
          )}
          {isUnderReview && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Admin is reviewing your CNIC{isLawyer ? ' and Bar Council certificate' : ''}.
            </p>
          )}
        </div>
      </Card>

      {!uploadLocked && (
        <Card>
          <CardHeader title="Step-by-step verification" subtitle="Complete one step at a time" />
          <div className="mb-4 flex flex-wrap gap-1">
            {stepDefs.map((s, i) => {
              const allowed = i <= maxAllowedStep;
              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={!allowed}
                  onClick={() => allowed && setWizardStep(i)}
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                    !allowed
                      ? 'cursor-not-allowed bg-slate-100 text-slate-400 opacity-60'
                      : i === wizardStep
                        ? 'bg-lk-accent text-white'
                        : i < maxAllowedStep
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {i + 1}. {s.title}
                </button>
              );
            })}
          </div>

          <div className="mb-2">
            <h3 className="text-lg font-semibold text-slate-800">
              Step {wizardStep + 1}: {current?.title}
            </h3>
            <p className="text-sm text-slate-500">{current?.subtitle}</p>
          </div>

          {stepContent()}

          <div className="mt-6 flex justify-between border-t border-slate-100 pt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={wizardStep === 0}
              onClick={() => setWizardStep((s) => Math.max(0, s - 1))}
              leftIcon={<FiChevronLeft />}
            >
              Back
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={
                wizardStep >= stepDefs.length - 1 ||
                wizardStep >= maxAllowedStep ||
                (current?.id === 'verify' && !checksPassed)
              }
              onClick={() => {
                if (current?.id === 'verify' && !checksPassed) {
                  toast.error('Run identity check and pass before continuing.');
                  return;
                }
                setWizardStep((s) => Math.min(maxAllowedStep, s + 1));
              }}
              rightIcon={<FiChevronRight />}
            >
              Next
            </Button>
          </div>
        </Card>
      )}

      <LivenessSelfieModal
        isOpen={selfieOpen}
        onClose={() => setSelfieOpen(false)}
        onCapture={(file) => void handleSelfieCaptured(file)}
      />
    </div>
  );
}
