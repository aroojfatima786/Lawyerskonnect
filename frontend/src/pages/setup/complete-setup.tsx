import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth, useRole } from "../../context/AuthContext";
import { authApi, identityApi } from "../../services/api";
import { MAX_KYC_FILE_BYTES, MAX_KYC_FILE_LABEL } from "../../constants/uploadLimits";
import { DocumentType } from "../../types";
import { useToast } from "../../components/ui/Toast";
import {
  formatCnicInput,
  validateCnic,
  CNIC_FORMAT_HINT,
  isCnicMismatchError,
  normalizeKycCheckError,
} from "../../utils/cnic";
import { lkNativeSelectClassName } from "../../components/ui/Select";
import { LivenessSelfieModal } from "../../components/kyc/LivenessSelfieModal";
import { FiCamera, FiCheckCircle } from "react-icons/fi";

function SetupBrandLogo() {
  return (
    <img
      src="/image.png"
      alt="LawyersKonnect"
      className="mx-auto mb-4 h-16 w-16 rounded-full border-[3px] border-[#f0a31c] object-cover shadow-md"
    />
  );
}

const CompleteProfilePage = () => {
  const navigate = useNavigate();
  const { user, updateUser, refreshUser } = useAuth();
  const { isLawyer } = useRole();
  const toast = useToast();

  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [selfieOpen, setSelfieOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [identityChecksPassed, setIdentityChecksPassed] = useState(false);
  const [identityCheckError, setIdentityCheckError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    fullName: '',
    phoneNumber: '',
    cnic: '',
    city: '',
    country: 'Pakistan',
    address: '',
    practiceAreas: [] as string[],
    yearsOfExperience: '',
    barCouncilNumber: '',
    officeAddress: '',
    bio: '',
    consultationFee: '',
  });

  useEffect(() => {
    const profile = isLawyer ? user?.lawyerProfile : user?.citizenProfile;
    if (!profile) return;
    setFormData((prev) => ({
      ...prev,
      fullName: prev.fullName || profile.fullName || '',
      phoneNumber: prev.phoneNumber || profile.phoneNumber || '',
      cnic: prev.cnic || profile.cnic || '',
      city: prev.city || profile.city || '',
      country: prev.country || 'Pakistan',
      address: prev.address || (profile as { address?: string }).address || '',
      barCouncilNumber: prev.barCouncilNumber || (profile as { barCouncilNumber?: string }).barCouncilNumber || '',
      practiceAreas:
        prev.practiceAreas.length > 0
          ? prev.practiceAreas
          : (profile as { practiceAreas?: string[] }).practiceAreas || [],
    }));
  }, [user, isLawyer]);

  const [kycUploaded, setKycUploaded] = useState({
    cnic_front: false,
    cnic_back: false,
    selfie: false,
    bar_certificate: false,
  });
  const [uploadingDoc, setUploadingDoc] = useState(false);

  const totalSteps = isLawyer ? 5 : 1;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'cnic' ? formatCnicInput(value) : value,
    }));
  };

  const cnicCheck = validateCnic(formData.cnic);
  const cnicError = formData.cnic.trim() && !cnicCheck.valid ? cnicCheck.message : '';
  const identityCnicMismatch = identityCheckError
    ? isCnicMismatchError(identityCheckError)
    : false;

  const buildProfilePayload = () =>
    isLawyer
      ? {
          fullName: formData.fullName,
          phoneNumber: formData.phoneNumber,
          cnic: formData.cnic ? formatCnicInput(formData.cnic) : formData.cnic,
          city: formData.city,
          country: formData.country,
          practiceAreas: formData.practiceAreas,
          yearsOfExperience: parseInt(formData.yearsOfExperience) || 0,
          barCouncilNumber: formData.barCouncilNumber,
          officeAddress: formData.officeAddress,
          bio: formData.bio,
          consultationFee: parseInt(formData.consultationFee) || 2000,
        }
      : {
          fullName: formData.fullName,
          phoneNumber: formData.phoneNumber,
          cnic: formData.cnic ? formatCnicInput(formData.cnic) : formData.cnic,
          city: formData.city,
          country: formData.country,
          address: formData.address,
        };

  /** Identity check reads CNIC from saved profile — sync wizard Step 1 data first. */
  const syncProfileForKyc = async (): Promise<boolean> => {
    const submitCnic = validateCnic(formData.cnic);
    if (!submitCnic.valid) {
      const msg = submitCnic.message || `Enter a valid CNIC in Step 1 (${CNIC_FORMAT_HINT}).`;
      setIdentityCheckError(msg);
      toast.error(msg);
      return false;
    }
    if (!formData.fullName?.trim() || !formData.phoneNumber?.trim() || !formData.city) {
      const msg = 'Complete Step 1 (name, phone, city, CNIC) before running identity check.';
      setIdentityCheckError(msg);
      toast.error(msg);
      return false;
    }
    try {
      const response: any = await authApi.completeProfile(buildProfilePayload());
      if (response?.user) updateUser(response.user);
      return true;
    } catch (err: any) {
      const msg = err.message || 'Could not save profile for verification';
      setIdentityCheckError(msg);
      toast.error(msg);
      return false;
    }
  };

  const hasCnicDocs = kycUploaded.cnic_front && kycUploaded.cnic_back;
  const hasRequiredKycDocs =
    hasCnicDocs &&
    kycUploaded.selfie &&
    identityChecksPassed &&
    kycUploaded.bar_certificate;

  const handleKycUpload = async (documentType: DocumentType, file: File) => {
    if (documentType === DocumentType.BAR_CERTIFICATE && !identityChecksPassed) {
      toast.error('Complete live selfie and identity check first (Step 4).');
      return;
    }
    const isBarCert = documentType === DocumentType.BAR_CERTIFICATE;
    if (!isBarCert && !/\.(jpg|jpeg|png|webp)$/i.test(file.name)) {
      toast.error(`${file.name}: CNIC and selfie must be JPG or PNG`);
      return;
    }
    if (isBarCert && !/\.(pdf|jpg|jpeg|png)$/i.test(file.name)) {
      toast.error(`${file.name}: Only PDF, JPG, PNG allowed`);
      return;
    }
    if (file.size > MAX_KYC_FILE_BYTES) {
      toast.error(`${file.name}: File too large. Maximum size is ${MAX_KYC_FILE_LABEL} per file.`);
      return;
    }
    setUploadingDoc(true);
    try {
      await identityApi.uploadDocument(documentType, file);
      const key =
        documentType === DocumentType.CNIC_FRONT
          ? 'cnic_front'
          : documentType === DocumentType.CNIC_BACK
            ? 'cnic_back'
            : documentType === DocumentType.SELFIE
              ? 'selfie'
              : 'bar_certificate';
      setKycUploaded((prev) => ({ ...prev, [key]: true }));
      if (documentType !== DocumentType.BAR_CERTIFICATE) {
        setIdentityChecksPassed(false);
      }
      toast.success(documentType === DocumentType.SELFIE ? 'Live selfie verified and uploaded' : 'Document uploaded');
    } catch (err: any) {
      toast.error(err.message || 'Upload failed');
    } finally {
      setUploadingDoc(false);
    }
  };

  const runIdentityCheck = async () => {
    setChecking(true);
    setIdentityCheckError(null);
    try {
      const synced = await syncProfileForKyc();
      if (!synced) return false;

      const cnicForCheck = formatCnicInput(formData.cnic);
      const resData: any = await identityApi.runAutomatedCheck(cnicForCheck);
      const review = resData?.kycReview ?? resData?.data?.kycReview;
      if (!review?.ocrMatched || !review?.faceMatchPassed) {
        throw new Error('Identity check did not pass. Use your own CNIC and your own selfie.');
      }
      setIdentityChecksPassed(true);
      setIdentityCheckError(null);
      toast.success('CNIC OCR and face verification passed');
      return true;
    } catch (err: any) {
      setIdentityChecksPassed(false);
      const msg = normalizeKycCheckError(err.message || 'Identity check failed');
      setIdentityCheckError(msg);
      toast.error(msg);
      return false;
    } finally {
      setChecking(false);
    }
  };

  const handleSelfieCaptured = async (file: File) => {
    setIdentityCheckError(null);
    setIdentityChecksPassed(false);
    await handleKycUpload(DocumentType.SELFIE, file);
    toast.success('Selfie saved. Continue and run identity check (CNIC + face match).');
  };

  const handleContinue = async () => {
    if (step === 4 && kycUploaded.selfie && !identityChecksPassed) {
      const ok = await runIdentityCheck();
      if (!ok) return;
    }
    setStep((s) => Math.min(totalSteps, s + 1));
  };

  const handleSubmit = async () => {
    if (isLawyer && !hasRequiredKycDocs) {
      toast.error('Complete all verification steps: CNIC, live selfie, identity check, and Bar Council certificate.');
      return;
    }

    const submitCnic = validateCnic(formData.cnic);
    if (!submitCnic.valid) {
      toast.error(submitCnic.message || 'Enter a valid CNIC.');
      return;
    }

    try {
      setLoading(true);

      const response: any = await authApi.completeProfile(buildProfilePayload());

      if (response.success || response.user) {
        if (response.user) {
          updateUser(response.user);
        }

        if (isLawyer && hasRequiredKycDocs) {
          try {
            await identityApi.submitVerification();
            await refreshUser();
            toast.success('Profile completed. Documents sent to admin for review.');
          } catch (submitErr: any) {
            await refreshUser();
            toast.success('Profile completed. Open Profile → KYC if admin submission needs retry.');
            console.warn('[CompleteProfile] KYC submit failed:', submitErr);
          }
        } else {
          toast.success('Profile completed successfully!');
        }

        const dashboardPath = user?.role === 'admin' ? '/admin' : user?.role === 'lawyer' ? '/lawyer/dashboard' : '/client/dashboard';
        setTimeout(() => {
          navigate(dashboardPath, { replace: true });
        }, 100);
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to complete profile');
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    const dashboardPath = user?.role === 'admin' ? '/admin' : user?.role === 'lawyer' ? '/lawyer/dashboard' : '/client/dashboard';
    navigate(dashboardPath, { replace: true });
  };

  const practiceAreaOptions = [
    'Family Law', 'Criminal Law', 'Civil Law', 'Corporate Law',
    'Property Law', 'Tax Law', 'Labor Law', 'Immigration Law',
    'Intellectual Property', 'Banking Law', 'Constitutional Law',
    'Environmental Law', 'Human Rights', 'Cyber Law',
  ];

  const togglePracticeArea = (area: string) => {
    setFormData(prev => ({
      ...prev,
      practiceAreas: prev.practiceAreas.includes(area)
        ? prev.practiceAreas.filter(a => a !== area)
        : [...prev.practiceAreas, area]
    }));
  };

  const canComplete =
    formData.fullName &&
    formData.phoneNumber &&
    formData.city &&
    (!isLawyer || hasRequiredKycDocs);

  const imageUploadSlot = (
    label: string,
    type: DocumentType,
    uploadedKey: keyof typeof kycUploaded,
    accept = '.jpg,.jpeg,.png,image/jpeg,image/png,image/webp',
  ) => (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-slate-700">{label} *</label>
      <label className="flex flex-col items-center justify-center w-full cursor-pointer rounded-xl border-2 border-dashed border-slate-200 p-4 transition hover:border-[#f0a31c] hover:bg-amber-50/30">
        <input
          type="file"
          accept={accept}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleKycUpload(type, file);
            e.target.value = '';
          }}
          disabled={uploadingDoc || kycUploaded[uploadedKey]}
          className="hidden"
        />
        <span className="text-[#f0a31c] font-medium text-sm">
          {kycUploaded[uploadedKey] ? `${label} uploaded` : uploadingDoc ? 'Uploading...' : `Upload ${label.toLowerCase()}`}
        </span>
      </label>
    </div>
  );

  const canContinueFromStep = () => {
    if (!isLawyer) return false;
    if (step === 1) {
      return formData.fullName && formData.phoneNumber && formData.city && formData.cnic.trim() && !cnicError;
    }
    if (step === 2) {
      return formData.barCouncilNumber && formData.practiceAreas.length > 0;
    }
    if (step === 3) return hasCnicDocs;
    if (step === 4) return kycUploaded.selfie && identityChecksPassed;
    return false;
  };

  const showContinue = isLawyer && step < totalSteps && step !== 5;

  return (
    <div className="min-h-screen bg-gradient-to-br from-lk-navy via-slate-900 to-slate-950 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <SetupBrandLogo />
          <h1 className="text-2xl font-bold text-white">Complete Your Profile</h1>
          <p className="text-white/70 mt-2">
            {isLawyer
              ? 'Set up your lawyer profile step by step'
              : 'Add your details to get started'}
          </p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-lk-border bg-lk-surface shadow-lk-card-lg">
          <div className="border-b border-lk-border bg-slate-50 px-6 py-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-lk-muted">Profile Completion</span>
              <span className="font-semibold text-lk-accent">
                Step {step} of {totalSteps}
              </span>
            </div>
            {isLawyer && (
              <p className="mt-1 text-xs text-slate-500">
                {step === 1 && 'Personal details'}
                {step === 2 && 'Professional details'}
                {step === 3 && 'CNIC documents'}
                {step === 4 && 'Live selfie + identity check'}
                {step === 5 && 'Bar Council certificate'}
              </p>
            )}
            <div className="mt-2 h-2 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-lk-accent transition-all"
                style={{ width: `${(step / totalSteps) * 100}%` }}
              />
            </div>
          </div>

          <div className="p-6">
            {step === 1 && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-slate-800 mb-4">Personal Information</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Full Name *</label>
                    <input
                      type="text"
                      name="fullName"
                      value={formData.fullName}
                      onChange={handleChange}
                      placeholder="Enter your full name"
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#f0a31c] focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Phone Number *</label>
                    <input
                      type="tel"
                      name="phoneNumber"
                      value={formData.phoneNumber}
                      onChange={handleChange}
                      placeholder="+92 300 1234567"
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#f0a31c] focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">CNIC *</label>
                    <input
                      type="text"
                      name="cnic"
                      value={formData.cnic}
                      onChange={handleChange}
                      placeholder={CNIC_FORMAT_HINT}
                      inputMode="numeric"
                      autoComplete="off"
                      maxLength={15}
                      className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:border-transparent ${
                        cnicError
                          ? 'border-red-400 focus:ring-red-200'
                          : 'border-slate-200 focus:ring-lk-accent/30'
                      }`}
                    />
                    {cnicError ? (
                      <p className="mt-1 text-xs text-red-600">{cnicError}</p>
                    ) : (
                      <p className="mt-1 text-xs text-slate-500">13 digits — format {CNIC_FORMAT_HINT}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">City *</label>
                    <select
                      name="city"
                      value={formData.city}
                      onChange={handleChange}
                      className={lkNativeSelectClassName}
                    >
                      <option value="">Select city</option>
                      <option value="Karachi">Karachi</option>
                      <option value="Lahore">Lahore</option>
                      <option value="Islamabad">Islamabad</option>
                      <option value="Rawalpindi">Rawalpindi</option>
                      <option value="Faisalabad">Faisalabad</option>
                      <option value="Multan">Multan</option>
                      <option value="Peshawar">Peshawar</option>
                      <option value="Quetta">Quetta</option>
                    </select>
                  </div>
                </div>
                {!isLawyer && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
                    <textarea
                      name="address"
                      value={formData.address}
                      onChange={handleChange}
                      placeholder="Enter your address"
                      rows={2}
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#f0a31c] focus:border-transparent resize-none"
                    />
                  </div>
                )}
              </div>
            )}

            {step === 2 && isLawyer && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-slate-800 mb-4">Professional Information</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Bar Council Number *</label>
                    <input
                      type="text"
                      name="barCouncilNumber"
                      value={formData.barCouncilNumber}
                      onChange={handleChange}
                      placeholder="Enter bar council number"
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#f0a31c] focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Years of Experience</label>
                    <input
                      type="number"
                      name="yearsOfExperience"
                      value={formData.yearsOfExperience}
                      onChange={handleChange}
                      placeholder="5"
                      min="0"
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#f0a31c] focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Consultation Fee (PKR)</label>
                    <input
                      type="number"
                      name="consultationFee"
                      value={formData.consultationFee}
                      onChange={handleChange}
                      placeholder="2000"
                      min="0"
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#f0a31c] focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Office Address</label>
                    <input
                      type="text"
                      name="officeAddress"
                      value={formData.officeAddress}
                      onChange={handleChange}
                      placeholder="Enter office address"
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#f0a31c] focus:border-transparent"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Practice Areas *</label>
                  <div className="flex flex-wrap gap-2">
                    {practiceAreaOptions.map(area => (
                      <button
                        key={area}
                        type="button"
                        onClick={() => togglePracticeArea(area)}
                        className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                          formData.practiceAreas.includes(area)
                            ? 'bg-[#f0a31c] text-white border-[#f0a31c]'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-[#f0a31c]'
                        }`}
                      >
                        {area}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Bio</label>
                  <textarea
                    name="bio"
                    value={formData.bio}
                    onChange={handleChange}
                    placeholder="Write a brief bio about yourself and your experience..."
                    rows={3}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#f0a31c] focus:border-transparent resize-none"
                  />
                </div>
              </div>
            )}

            {step === 3 && isLawyer && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-slate-800 mb-2">CNIC documents</h2>
                <p className="text-sm text-slate-600 mb-4">
                  Upload front and back of your CNIC. JPG or PNG only. Max {MAX_KYC_FILE_LABEL} per file.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  {imageUploadSlot('CNIC front', DocumentType.CNIC_FRONT, 'cnic_front')}
                  {imageUploadSlot('CNIC back', DocumentType.CNIC_BACK, 'cnic_back')}
                </div>
                {hasCnicDocs && (
                  <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                    CNIC uploaded. Continue to live selfie verification.
                  </p>
                )}
              </div>
            )}

            {step === 4 && isLawyer && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-slate-800 mb-2">Live selfie verification</h2>
                <p className="text-sm text-slate-600">
                  Camera only. Follow liveness steps: look straight, turn head left, turn right, look down.
                  Green here means liveness only — identity check (CNIC OCR + same face on card) runs when you continue.
                </p>
                {!hasCnicDocs && (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    Upload CNIC front and back first (Step 3).
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => setSelfieOpen(true)}
                  disabled={uploadingDoc || checking || !hasCnicDocs}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-[#f0a31c] hover:bg-amber-50/30 disabled:opacity-60"
                >
                  <FiCamera />
                  {kycUploaded.selfie ? 'Retake live selfie + liveness' : 'Start live selfie verification'}
                </button>
                {kycUploaded.selfie && (
                  <p className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                    <FiCheckCircle /> Live liveness completed — selfie uploaded
                  </p>
                )}
                {checking && (
                  <p className="text-sm text-slate-600 text-center">Running CNIC OCR and face match…</p>
                )}
                {!checking && kycUploaded.selfie && !identityChecksPassed && (
                  <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    <p>
                      Liveness is done. Tap <strong>Continue</strong> or the button below to run CNIC OCR and face
                      match. Your Step 1 CNIC ({formData.cnic.trim() || 'missing — go back to Step 1'}) is saved to
                      profile first, then compared with your CNIC card photo.
                    </p>
                    <button
                      type="button"
                      onClick={() => void runIdentityCheck()}
                      disabled={checking || !hasCnicDocs}
                      className="w-full rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
                    >
                      Run identity check now
                    </button>
                    {identityCheckError && (
                      <p className="text-xs text-red-700">
                        {normalizeKycCheckError(identityCheckError)}
                      </p>
                    )}
                    {identityCnicMismatch && (
                      <div className="space-y-2 rounded-lg border border-amber-300 bg-white px-3 py-3 text-sm">
                        <label className="block text-xs font-semibold text-slate-700">CNIC number</label>
                        <input
                          type="text"
                          name="identity-cnic-fix"
                          value={formData.cnic}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              cnic: formatCnicInput(e.target.value),
                            }))
                          }
                          placeholder={CNIC_FORMAT_HINT}
                          inputMode="numeric"
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        />
                        {cnicError && <p className="text-xs text-red-600">{cnicError}</p>}
                        <button
                          type="button"
                          onClick={() => void runIdentityCheck()}
                          disabled={checking || Boolean(cnicError) || !formData.cnic.trim()}
                          className="w-full rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
                        >
                          Update CNIC & run check again
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {identityChecksPassed && (
                  <p className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                    <FiCheckCircle /> Identity check passed. Continue to Bar Council upload.
                  </p>
                )}
              </div>
            )}

            {step === 5 && isLawyer && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-slate-800 mb-2">Bar Council certificate</h2>
                <p className="text-sm text-slate-600 mb-4">
                  Upload your Bar Council license or certificate. PDF, JPG, or PNG. Max {MAX_KYC_FILE_LABEL}.
                </p>
                {!identityChecksPassed && (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    Complete live selfie and identity check first (Step 4).
                  </p>
                )}
                {imageUploadSlot(
                  'Bar Council license / certificate',
                  DocumentType.BAR_CERTIFICATE,
                  'bar_certificate',
                  '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png',
                )}
                {hasRequiredKycDocs && (
                  <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                    All steps complete. Tap Complete Setup to finish.
                  </p>
                )}
              </div>
            )}

            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              {step > 1 && (
                <button
                  type="button"
                  onClick={() => setStep(step - 1)}
                  className="flex-1 py-3 border border-slate-200 text-slate-600 font-semibold rounded-xl hover:bg-slate-50 transition-colors"
                >
                  Back
                </button>
              )}

              {showContinue ? (
                <button
                  type="button"
                  onClick={() => void handleContinue()}
                  disabled={!canContinueFromStep() || checking}
                  className="flex-1 py-3 bg-[#f0a31c] text-white font-semibold rounded-xl hover:bg-[#d99318] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                  style={{ boxShadow: '0 10px 22px rgba(240,163,28,.25)' }}
                >
                  {checking ? 'Checking…' : step === 4 && kycUploaded.selfie && !identityChecksPassed ? 'Continue (run check)' : 'Continue'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={loading || !canComplete}
                  className="flex-1 py-3 bg-[#f0a31c] text-white font-semibold rounded-xl hover:bg-[#d99318] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                  style={{ boxShadow: '0 10px 22px rgba(240,163,28,.25)' }}
                >
                  {loading ? 'Saving...' : 'Complete Setup'}
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={handleSkip}
              className="w-full mt-4 py-2 text-sm text-slate-500 hover:text-slate-700 transition-colors"
            >
              Skip for now →
            </button>
          </div>
        </div>
      </div>

      <LivenessSelfieModal
        isOpen={selfieOpen}
        onClose={() => setSelfieOpen(false)}
        onCapture={(file) => void handleSelfieCaptured(file)}
      />
    </div>
  );
};

export default CompleteProfilePage;
