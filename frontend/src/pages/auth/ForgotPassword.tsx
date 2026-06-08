import React, { useEffect, useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { FiMail, FiArrowLeft, FiLock, FiEye, FiEyeOff } from 'react-icons/fi';
import { authApi } from '../../services/api';
import { Button, Input } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';

type Step = 'email' | 'code' | 'password';

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const toast = useToast();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const emailFromQuery = searchParams.get('email');
    const codeFromQuery = searchParams.get('code');
    if (emailFromQuery) {
      setEmail(emailFromQuery);
    }
    if (codeFromQuery && codeFromQuery.length === 6) {
      setCode(codeFromQuery);
      setStep('code');
    }
  }, [searchParams]);

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await authApi.forgotPassword(email);
      toast.success('Reset code sent to your email');
      setStep('code');
    } catch (error: any) {
      toast.error(error.message || 'Failed to send reset code');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await authApi.verifyResetCode(email, code);
      toast.success('Code verified');
      setStep('password');
    } catch (error: any) {
      toast.error(error.message || 'Invalid or expired code');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      await authApi.resetPassword(email, code, newPassword);
      toast.success('Password reset successfully! Please login.');
      navigate('/auth/citizen/login');
    } catch (error: any) {
      toast.error(error.message || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#163b63] to-[#0f2746] flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-[440px]">
        {/* Back button */}
        <Link
          to="/auth/citizen/login"
          className="inline-flex items-center gap-2 text-white/80 hover:text-white mb-6 transition-colors"
        >
          <FiArrowLeft />
          <span>Back to Login</span>
        </Link>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl border border-white/50 overflow-hidden">
          {/* Header */}
          <div className="bg-[#163b63] px-6 py-8 text-white text-center">
            <div
              className="mx-auto h-16 w-16 rounded-full border-[3px] border-[#f0a31c] mb-4 flex items-center justify-center"
              style={{ background: 'radial-gradient(circle at 30% 30%, #234d7a, #0b2746)' }}
            >
              <FiLock className="text-2xl" />
            </div>
            <h1 className="text-2xl font-bold">Reset Password</h1>
            <p className="text-white/70 mt-2 text-sm">
              {step === 'email' && 'Enter your email to receive a reset code'}
              {step === 'code' && 'Enter the 6-digit code sent to your email'}
              {step === 'password' && 'Create a new password for your account'}
            </p>
          </div>

          {/* Form */}
          <div className="p-6 sm:p-7">
            {step === 'email' && (
              <form onSubmit={handleSendCode} className="space-y-4">
                <Input
                  label="Email Address"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  required
                  leftIcon={<FiMail />}
                />

                <Button type="submit" className="w-full" size="lg" isLoading={loading}>
                  Send Reset Code
                </Button>
              </form>
            )}

            {step === 'code' && (
              <form onSubmit={handleVerifyCode} className="space-y-4">
                <div className="text-center mb-4">
                  <p className="text-slate-600">
                    We've sent a code to <strong>{email}</strong>
                  </p>
                </div>

                <Input
                  label="Reset Code"
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="Enter 6-digit code"
                  required
                  maxLength={6}
                  className="text-center text-2xl tracking-widest"
                />

                <Button type="submit" className="w-full" size="lg" isLoading={loading}>
                  Verify Code
                </Button>

                <div className="text-center text-sm">
                  <span className="text-slate-600">Didn't receive the code? </span>
                  <button
                    type="button"
                    onClick={() => {
                      setStep('email');
                      setCode('');
                    }}
                    className="text-[#f0a31c] hover:underline font-medium"
                  >
                    Try again
                  </button>
                </div>
              </form>
            )}

            {step === 'password' && (
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div className="relative">
                  <Input
                    label="New Password"
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    required
                    leftIcon={<FiLock />}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-[38px] text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <FiEyeOff /> : <FiEye />}
                  </button>
                </div>

                <Input
                  label="Confirm Password"
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  required
                  leftIcon={<FiLock />}
                  error={
                    confirmPassword && confirmPassword !== newPassword
                      ? 'Passwords do not match'
                      : undefined
                  }
                />

                <Button
                  type="submit"
                  className="w-full"
                  size="lg"
                  isLoading={loading}
                  disabled={!newPassword || newPassword !== confirmPassword}
                >
                  Reset Password
                </Button>
              </form>
            )}
          </div>
        </div>

        {/* Progress indicator */}
        <div className="mt-6 flex justify-center gap-2">
          {['email', 'code', 'password'].map((s, i) => (
            <div
              key={s}
              className={`h-2 w-8 rounded-full transition-colors ${
                ['email', 'code', 'password'].indexOf(step) >= i
                  ? 'bg-[#f0a31c]'
                  : 'bg-white/30'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
