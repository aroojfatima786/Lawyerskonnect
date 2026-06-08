import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FiUser, FiLock, FiCreditCard, FiSave, FiClock, FiFileText } from 'react-icons/fi';
import { useAuth, useRole } from '../../context/AuthContext';
import { authApi, lawyerApi } from '../../services/api';
import { Card, CardHeader, Button, Input, Textarea, Select, lkNativeSelectClassName } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import { BIO_MAX_WORDS, countWords, truncateToWordLimit } from '../../utils/wordCount';
import { KycVerificationPanel } from '../../components/kyc/KycVerificationPanel';
import { formatCnicInput, validateCnic, CNIC_FORMAT_HINT } from '../../utils/cnic';

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const TIME_OPTIONS = (() => {
  const opts: string[] = [];
  for (let h = 0; h < 24; h++) for (let m = 0; m < 60; m += 30) opts.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  return opts;
})();

interface AvailabilitySlot {
  day: string;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
}

export default function ProfileSettings() {
  const { user, refreshUser } = useAuth();
  const { isLawyer } = useRole();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');

  const [activeTab, setActiveTab] = useState<'profile' | 'password' | 'payment' | 'availability' | 'kyc'>(
    tabParam === 'availability' && isLawyer
      ? 'availability'
      : tabParam === 'kyc'
        ? 'kyc'
        : 'profile'
  );
  useEffect(() => {
    if (tabParam === 'availability' && isLawyer) setActiveTab('availability');
    if (tabParam === 'kyc') setActiveTab('kyc');
  }, [tabParam, isLawyer]);
  const [saving, setSaving] = useState(false);

  // Profile form state
  const profile = isLawyer ? user?.lawyerProfile : user?.citizenProfile;
  const [fullName, setFullName] = useState(profile?.fullName || '');
  const [phoneNumber, setPhoneNumber] = useState(profile?.phoneNumber || '');
  const [city, setCity] = useState(profile?.city || '');
  const [cnic, setCnic] = useState(profile?.cnic || '');
  const [address, setAddress] = useState(
    isLawyer ? (user?.lawyerProfile?.officeAddress || '') : (user?.citizenProfile?.address || '')
  );

  // Lawyer specific
  const [bio, setBio] = useState(user?.lawyerProfile?.bio || '');
  const [yearsOfExperience, setYearsOfExperience] = useState(
    user?.lawyerProfile?.yearsOfExperience?.toString() || ''
  );
  const [consultationFee, setConsultationFee] = useState(
    user?.lawyerProfile?.consultationFee?.toString() || ''
  );
  const [education, setEducation] = useState(user?.lawyerProfile?.education || '');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [paymentMethod, setPaymentMethod] = useState(user?.paymentInfo?.methodType || '');
  const [accountTitle, setAccountTitle] = useState(
    user?.paymentInfo?.accountTitle || user?.lawyerProfile?.payoutAccount?.accountTitle || '',
  );
  const [accountIdentifier, setAccountIdentifier] = useState(user?.paymentInfo?.accountIdentifier || '');

  const [payoutMethod, setPayoutMethod] = useState<'bank' | 'jazzcash' | 'easypaisa'>(
    (user?.lawyerProfile?.payoutAccount?.method as 'bank' | 'jazzcash' | 'easypaisa') || 'bank',
  );
  const [payoutBankName, setPayoutBankName] = useState(user?.lawyerProfile?.payoutAccount?.bankName || '');
  const [payoutAccountNumber, setPayoutAccountNumber] = useState(
    user?.lawyerProfile?.payoutAccount?.accountNumber || '',
  );
  const [payoutIban, setPayoutIban] = useState(user?.lawyerProfile?.payoutAccount?.iban || '');
  const [payoutMobileNumber, setPayoutMobileNumber] = useState(
    user?.lawyerProfile?.payoutAccount?.mobileNumber || '',
  );

  const getInitialAvailability = (): AvailabilitySlot[] => {
    if (user?.lawyerProfile?.availability?.length) {
      const existingDays = user.lawyerProfile.availability.map((s) => s.day);
      const missingDays = DAYS_OF_WEEK.filter((d) => !existingDays.includes(d));
      return [
        ...user.lawyerProfile.availability,
        ...missingDays.map((day) => ({
          day,
          startTime: '09:00',
          endTime: '17:00',
          isAvailable: false,
        })),
      ].sort((a, b) => DAYS_OF_WEEK.indexOf(a.day) - DAYS_OF_WEEK.indexOf(b.day));
    }
    return DAYS_OF_WEEK.map((day) => ({
      day,
      startTime: '09:00',
      endTime: '17:00',
      isAvailable: !['Saturday', 'Sunday'].includes(day),
    }));
  };

  const [availability, setAvailability] = useState<AvailabilitySlot[]>(getInitialAvailability);
  const [savingAvailability, setSavingAvailability] = useState(false);

  useEffect(() => {
    if (isLawyer) setAvailability(getInitialAvailability());
  }, [user?.lawyerProfile?.availability, isLawyer]);

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':');
    const h = parseInt(hours, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${minutes} ${ampm}`;
  };

  const calcHours = (start: string, end: string) => {
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    return Math.max(0, (eh * 60 + em - (sh * 60 + sm)) / 60);
  };

  const handleToggleDay = (day: string) => {
    setAvailability((prev) =>
      prev.map((slot) => (slot.day === day ? { ...slot, isAvailable: !slot.isAvailable } : slot)),
    );
  };

  const handleTimeChange = (day: string, field: 'startTime' | 'endTime', value: string) => {
    setAvailability((prev) =>
      prev.map((slot) => (slot.day === day ? { ...slot, [field]: value } : slot)),
    );
  };

  const handleSaveAvailability = async () => {
    for (const slot of availability) {
      if (slot.isAvailable && slot.startTime >= slot.endTime) {
        toast.error(`Invalid time for ${slot.day}. End time must be after start time.`);
        return;
      }
    }
    setSavingAvailability(true);
    try {
      await lawyerApi.updateAvailability(availability);
      await refreshUser();
      toast.success('Availability saved');
    } catch (error: any) {
      toast.error(error.message || 'Failed to save availability');
    } finally {
      setSavingAvailability(false);
    }
  };

  const cnicCheck = validateCnic(cnic);
  const cnicFieldError = cnic.trim() && !cnicCheck.valid ? cnicCheck.message : undefined;

  const handleSaveProfile = async () => {
    const saveCnic = validateCnic(cnic);
    if (!saveCnic.valid) {
      toast.error(saveCnic.message || 'Enter a valid CNIC.');
      return;
    }

    setSaving(true);
    try {
      const data: any = {
        fullName,
        phoneNumber,
        city,
        cnic: cnic ? formatCnicInput(cnic) : cnic,
      };

      if (isLawyer) {
        data.officeAddress = address;
        data.bio = bio;
        data.yearsOfExperience = yearsOfExperience ? parseInt(yearsOfExperience) : undefined;
        data.consultationFee = consultationFee ? parseInt(consultationFee) : undefined;
        data.education = education;
        
        await lawyerApi.updateProfile(data);
      } else {
        data.address = address;
        await authApi.completeProfile(data);
      }

      await refreshUser();
      toast.success('Profile updated successfully');
    } catch (error: any) {
      toast.error(error.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setSaving(true);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      toast.success('Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      toast.error(error.message || 'Failed to change password');
    } finally {
      setSaving(false);
    }
  };

  const handleSavePayment = async () => {
    setSaving(true);
    try {
      if (isLawyer) {
        await lawyerApi.updateProfile({
          payoutAccount: {
            method: payoutMethod,
            accountTitle,
            bankName: payoutMethod === 'bank' ? payoutBankName : undefined,
            accountNumber: payoutMethod === 'bank' ? payoutAccountNumber : undefined,
            iban: payoutMethod === 'bank' ? payoutIban : undefined,
            mobileNumber: payoutMethod === 'bank' ? undefined : payoutMobileNumber,
          },
        });
      } else {
        await authApi.completeProfile({
          paymentInfo: {
            methodType: paymentMethod,
            accountTitle,
            accountIdentifier,
          },
        });
      }
      await refreshUser();
      toast.success(isLawyer ? 'Payout account updated' : 'Payment info updated');
    } catch (error: any) {
      toast.error(error.message || 'Failed to update payment info');
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { id: 'profile', label: 'Profile', icon: <FiUser /> },
    ...(isLawyer ? [{ id: 'availability' as const, label: 'Availability', icon: <FiClock /> }] : []),
    { id: 'kyc' as const, label: 'KYC Verification', icon: <FiFileText /> },
    { id: 'password', label: 'Password', icon: <FiLock /> },
    { id: 'payment', label: 'Payment', icon: <FiCreditCard /> },
  ];

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 overflow-x-hidden">
      {!isLawyer && (
        <div className="rounded-2xl border border-lk-border bg-gradient-to-br from-lk-surface to-[#F3F7FD]/40 p-5 shadow-lk-card-md ring-1 ring-slate-100/80 sm:p-6">
          <h2 className="text-lg font-bold text-lk-navy">Account overview</h2>
          <p className="mt-1 text-sm text-lk-muted">
            Signed in as <span className="font-semibold text-lk-navy">{user?.citizenProfile?.fullName || user?.email}</span>
            {user?.emailVerified ? (
              <span className="ml-2 inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-100">
                Email verified
              </span>
            ) : null}
          </p>
        </div>
      )}

      <div className="flex gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-gradient-to-r from-lk-navy to-[#1e3a8f] text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Profile Tab */}
      {activeTab === 'profile' && (
        <Card>
          <CardHeader title="Personal Information" />
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Full Name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Enter your full name"
              />
              <Input
                label="Phone Number"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="03XX-XXXXXXX"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="CNIC"
                value={cnic}
                onChange={(e) => setCnic(formatCnicInput(e.target.value))}
                placeholder={CNIC_FORMAT_HINT}
                maxLength={15}
                error={cnicFieldError}
                helperText={!cnicFieldError ? `13 digits — ${CNIC_FORMAT_HINT}` : undefined}
              />
              <Input
                label="City"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Enter your city"
              />
            </div>

            <Input
              label={isLawyer ? 'Office Address' : 'Address'}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Enter your address"
            />

            {isLawyer && (
              <>
                <Textarea
                  label="Bio"
                  value={bio}
                  onChange={(e) => setBio(truncateToWordLimit(e.target.value, BIO_MAX_WORDS))}
                  placeholder="Tell clients about yourself..."
                  rows={4}
                  helperText={`${countWords(bio)}/${BIO_MAX_WORDS} words (recommended 150–200)`}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    label="Years of Experience"
                    type="number"
                    value={yearsOfExperience}
                    onChange={(e) => setYearsOfExperience(e.target.value)}
                    placeholder="0"
                    min="0"
                  />
                  <Input
                    label="Consultation Fee (PKR)"
                    type="number"
                    value={consultationFee}
                    onChange={(e) => setConsultationFee(e.target.value)}
                    placeholder="0"
                    min="0"
                  />
                </div>

                <Input
                  label="Education"
                  value={education}
                  onChange={(e) => setEducation(e.target.value)}
                  placeholder="e.g., LLB from Punjab University"
                />
              </>
            )}

            <Button onClick={handleSaveProfile} isLoading={saving} leftIcon={<FiSave />}>
              Save Changes
            </Button>
          </div>
        </Card>
      )}

      {/* Password Tab */}
      {activeTab === 'password' && (
        <Card>
          <CardHeader title="Change Password" />
          <div className="space-y-4 max-w-md">
            <Input
              label="Current Password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter current password"
            />
            <Input
              label="New Password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password"
            />
            <Input
              label="Confirm New Password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              error={confirmPassword && confirmPassword !== newPassword ? 'Passwords do not match' : undefined}
            />
            <Button
              onClick={handleChangePassword}
              isLoading={saving}
              disabled={!currentPassword || !newPassword || newPassword !== confirmPassword}
            >
              Change Password
            </Button>
          </div>
        </Card>
      )}

      {activeTab === 'kyc' && (
        <KycVerificationPanel
          isLawyer={isLawyer}
          verificationStatus={
            isLawyer ? user?.lawyerProfile?.verificationStatus : user?.citizenProfile?.verificationStatus
          }
          rejectionReason={
            isLawyer
              ? user?.lawyerProfile?.verificationRejectionReason
              : user?.citizenProfile?.verificationRejectionReason
          }
          onRefreshUser={refreshUser}
        />
      )}

      {/* Availability Tab (Lawyer only) */}
      {activeTab === 'availability' && isLawyer && (
        <Card>
          <CardHeader
            title="Weekly Availability"
            subtitle="Set your available hours for consultations. Clients can only book during these times."
          />
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setAvailability(prev => prev.map(s => ({ ...s, isAvailable: true })))}>Enable All</Button>
              <Button variant="outline" size="sm" onClick={() => setAvailability(prev => prev.map(s => ({ ...s, isAvailable: false })))}>Disable All</Button>
              <Button variant="outline" size="sm" onClick={() => setAvailability(prev => prev.map(s => ({ ...s, isAvailable: !['Saturday', 'Sunday'].includes(s.day) })))}>Weekdays Only</Button>
            </div>
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-100 overflow-hidden">
              {availability.map((slot) => (
                <div key={slot.day} className={`p-4 flex flex-col sm:flex-row sm:items-center gap-3 ${slot.isAvailable ? 'bg-white' : 'bg-slate-50/50'}`}>
                  <div className="flex items-center gap-3 sm:w-40">
                    <button
                      type="button"
                      onClick={() => handleToggleDay(slot.day)}
                      className={`h-7 w-12 rounded-full transition-all relative flex-shrink-0 ${slot.isAvailable ? 'bg-green-500' : 'bg-slate-300'}`}
                    >
                      <span className={`absolute top-1 h-5 w-5 bg-white rounded-full shadow transition-all ${slot.isAvailable ? 'left-6' : 'left-1'}`} />
                    </button>
                    <span className={`font-medium text-sm ${slot.isAvailable ? 'text-slate-800' : 'text-slate-400'}`}>{slot.day}</span>
                  </div>
                  {slot.isAvailable ? (
                    <div className="flex flex-wrap items-center gap-3">
                      <select
                        value={slot.startTime}
                        onChange={(e) => handleTimeChange(slot.day, 'startTime', e.target.value)}
                        className={`${lkNativeSelectClassName} min-h-[40px] min-w-[108px] py-2 text-sm`}
                      >
                        {TIME_OPTIONS.map(t => (<option key={t} value={t}>{formatTime(t)}</option>))}
                      </select>
                      <span className="text-slate-400">to</span>
                      <select
                        value={slot.endTime}
                        onChange={(e) => handleTimeChange(slot.day, 'endTime', e.target.value)}
                        className={`${lkNativeSelectClassName} min-h-[40px] min-w-[108px] py-2 text-sm`}
                      >
                        {TIME_OPTIONS.map(t => (<option key={t} value={t}>{formatTime(t)}</option>))}
                      </select>
                      <span className="text-sm text-green-600 font-medium bg-green-50 px-2 py-1 rounded">{calcHours(slot.startTime, slot.endTime)} hrs</span>
                    </div>
                  ) : (
                    <span className="text-sm text-slate-400 italic">Not available</span>
                  )}
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex gap-4 text-sm">
                <span className="text-slate-600"><strong>{availability.filter(s => s.isAvailable).length}</strong> days</span>
                <span className="text-slate-600"><strong>{availability.filter(s => s.isAvailable).reduce((t, s) => t + calcHours(s.startTime, s.endTime), 0)}</strong> hrs/week</span>
              </div>
              <Button onClick={handleSaveAvailability} isLoading={savingAvailability} leftIcon={<FiSave />}>Save Availability</Button>
            </div>
          </div>
        </Card>
      )}

      {/* Payment Tab */}
      {activeTab === 'payment' && (
        <Card>
          <CardHeader
            title={isLawyer ? 'Payout Account' : 'Payment Information'}
            subtitle={
              isLawyer
                ? 'Add payout account to receive consultation earnings.'
                : 'Your payment preferences'
            }
          />
          <div className="space-y-4 max-w-md">
            {isLawyer ? (
              <>
                <Select
                  label="Payout Method"
                  value={payoutMethod}
                  onChange={(e) => setPayoutMethod(e.target.value as 'bank' | 'jazzcash' | 'easypaisa')}
                  options={[
                    { value: 'bank', label: 'Bank Account' },
                    { value: 'jazzcash', label: 'JazzCash' },
                    { value: 'easypaisa', label: 'EasyPaisa' },
                  ]}
                />
              </>
            ) : (
              <Select
                label="Payment Method"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                options={[
                  { value: '', label: 'Select method' },
                  { value: 'jazzcash', label: 'JazzCash' },
                  { value: 'easypaisa', label: 'EasyPaisa' },
                  { value: 'bank', label: 'Bank Account' },
                ]}
              />
            )}
            <Input
              label="Account Title"
              value={accountTitle}
              onChange={(e) => setAccountTitle(e.target.value)}
              placeholder="Name on account"
            />
            {isLawyer ? (
              <>
                {payoutMethod === 'bank' ? (
                  <>
                    <Input
                      label="Bank Name"
                      value={payoutBankName}
                      onChange={(e) => setPayoutBankName(e.target.value)}
                      placeholder="Enter bank name"
                    />
                    <Input
                      label="Account Number"
                      value={payoutAccountNumber}
                      onChange={(e) => setPayoutAccountNumber(e.target.value)}
                      placeholder="Enter account number"
                    />
                    <Input
                      label="IBAN (optional)"
                      value={payoutIban}
                      onChange={(e) => setPayoutIban(e.target.value)}
                      placeholder="PK.."
                    />
                  </>
                ) : (
                  <Input
                    label="Mobile Number"
                    value={payoutMobileNumber}
                    onChange={(e) => setPayoutMobileNumber(e.target.value)}
                    placeholder="03XX-XXXXXXX"
                  />
                )}
                {(user as any)?.lawyerProfile?.payoutAccount?.updatedAt && (
                  <p className="text-xs text-slate-500">
                    Saved payout details are used for automatic release after consultation completion.
                  </p>
                )}
              </>
            ) : (
              <Input
                label={paymentMethod === 'bank' ? 'Account Number' : 'Mobile Number'}
                value={accountIdentifier}
                onChange={(e) => setAccountIdentifier(e.target.value)}
                placeholder={paymentMethod === 'bank' ? 'Enter account number' : '03XX-XXXXXXX'}
              />
            )}
            <Button onClick={handleSavePayment} isLoading={saving} leftIcon={<FiSave />}>
              {isLawyer ? 'Save Payout Account' : 'Save Payment Info'}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
