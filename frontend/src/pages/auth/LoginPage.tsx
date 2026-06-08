import React, { useState } from 'react';
import { useNavigate, Link, useParams, useLocation } from 'react-router-dom';
import { FiMail, FiLock, FiArrowLeft, FiEye, FiEyeOff, FiLogIn } from 'react-icons/fi';
import { useAuth } from '../../context/AuthContext';
import { authApi } from '../../services/api';
import { Button, Input } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import { getApiBaseUrl } from '../../config/apiBase';

type UserType = 'citizen' | 'lawyer' | 'admin';

function resolvePostLoginPath(user: { role?: string; isProfileComplete?: boolean }, type: UserType, from?: string) {
  if (user.role === 'lawyer' && !user.isProfileComplete) return '/setup/complete-setup';
  if (user.role === 'admin') return '/admin';
  if (user.role === 'lawyer') return '/lawyer/dashboard';
  if (type === 'citizen' && from?.startsWith('/client')) return from;
  return '/client/dashboard';
}

export default function LoginPage() {
  const { userType } = useParams<{ userType: string }>();
  const type = (userType as UserType) || 'citizen';
  const location = useLocation();
  const redirectFrom = (location.state as { from?: string } | null)?.from;
  
  const navigate = useNavigate();
  const { login } = useAuth();
  const toast = useToast();
  const API_BASE = getApiBaseUrl();

  const handleGoogleLogin = () => {
    const roleParam = type === 'lawyer' ? 'lawyer' : 'citizen';
    window.location.href = `${API_BASE}/auth/google?role=${roleParam}`;
  };

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showOtpForm, setShowOtpForm] = useState(false);
  const [otp, setOtp] = useState('');

  const titles: Record<UserType, string> = {
    citizen: 'Citizen Login',
    lawyer: 'Lawyer Login',
    admin: 'Admin Login',
  };

  const descriptions: Record<UserType, string> = {
    citizen: 'Access your account to find and consult with lawyers',
    lawyer: 'Access your dashboard to manage appointments',
    admin: 'Admin panel access',
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      let response: any;
      
      if (type === 'admin') {
        response = await authApi.adminSignin(email, password);
      } else if (type === 'lawyer') {
        response = await authApi.lawyerSignin(email, password);
      } else {
        response = await authApi.citizenSignin(email, password);
      }

      if (response.skipOtp && response.token) {
        // Direct login - store in localStorage and state
        login(response.token, response.user);
        toast.success('Login successful!');
        
        // Small delay to ensure state is updated before navigation
        setTimeout(() => {
          navigate(resolvePostLoginPath(response.user, type, redirectFrom), { replace: true });
        }, 100);
      } else {
        // OTP sent
        toast.info('OTP sent to your email');
        setShowOtpForm(true);
      }
    } catch (error: any) {
      if (error?.code === 'REGISTRATION_PAYMENT_REQUIRED' && type === 'lawyer') {
        toast.info('Complete registration payment to continue.');
        navigate('/auth/lawyer/registration-payment', {
          replace: true,
          state: { userId: error.userId, email },
        });
        return;
      }
      toast.error(error.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response: any = await authApi.verifyOtp(email, otp, type);
      
      if (response.token) {
        login(response.token, response.user);
        toast.success('Login successful!');
        
        // Small delay to ensure state is updated before navigation
        setTimeout(() => {
          navigate(resolvePostLoginPath(response.user, type, redirectFrom), { replace: true });
        }, 100);
      }
    } catch (error: any) {
      toast.error(error.message || 'Invalid OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    try {
      await authApi.resendOtp(email, type);
      toast.success('OTP resent to your email');
    } catch (error: any) {
      toast.error(error.message || 'Failed to resend OTP');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-lk-navy via-slate-900 to-slate-950 p-4 sm:p-6">
      <div className="w-full max-w-[440px]">
        {/* Back button */}
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-white/80 hover:text-white mb-6 transition-colors"
        >
          <FiArrowLeft />
          <span>Back to Home</span>
        </Link>

        {/* Card */}
        <div className="overflow-hidden rounded-2xl border border-lk-border bg-lk-surface shadow-lk-card-lg">
          <div className="bg-lk-navy px-6 py-8 text-center text-white">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border-[3px] border-white/20 bg-white/10">
              <img src="/image.png" alt="" className="h-12 w-12 rounded-full object-cover" />
            </div>
            <h1 className="text-2xl font-bold">{titles[type]}</h1>
            <p className="text-white/70 mt-2 text-sm">{descriptions[type]}</p>
          </div>

          {/* Form */}
          <div className="p-6 sm:p-7">
            {!showOtpForm ? (
              <form onSubmit={handleLogin} className="space-y-4">
                <Input
                  label="Email Address"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  required
                  leftIcon={<FiMail />}
                />

                <Input
                  label="Password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  leftIcon={<FiLock />}
                  rightIcon={
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowPassword(!showPassword)}
                      className="text-lk-muted transition-colors hover:text-lk-navy"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <FiEyeOff size={18} /> : <FiEye size={18} />}
                    </button>
                  }
                />

                <div className="flex items-center justify-between text-sm">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="rounded border-slate-300" />
                    <span className="text-slate-600">Remember me</span>
                  </label>
                  {type !== 'admin' && (
                    <Link to="/auth/forgot-password" className="font-semibold text-lk-accent hover:underline">
                      Forgot Password?
                    </Link>
                  )}
                </div>

                <Button type="submit" className="w-full" size="lg" isLoading={loading}>
                  Sign In
                </Button>

                {type !== 'admin' && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full mt-3 flex items-center justify-center gap-2"
                    onClick={handleGoogleLogin}
                    leftIcon={<FiLogIn />}
                  >
                    Continue with Google
                  </Button>
                )}
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <div className="text-center mb-4">
                  <p className="text-slate-600">
                    We've sent a 6-digit code to <strong>{email}</strong>
                  </p>
                </div>

                <Input
                  label="Enter OTP"
                  type="text"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="Enter 6-digit code"
                  required
                  maxLength={6}
                  className="text-center text-2xl tracking-widest"
                />

                <Button type="submit" className="w-full" size="lg" isLoading={loading}>
                  Verify OTP
                </Button>

                <div className="text-center text-sm">
                  <span className="text-slate-600">Didn't receive the code? </span>
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    className="font-semibold text-lk-accent hover:underline"
                  >
                    Resend OTP
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setShowOtpForm(false);
                    setOtp('');
                  }}
                  className="w-full text-center text-slate-600 hover:text-slate-800 text-sm"
                >
                  ← Back to login
                </button>
              </form>
            )}

            {type !== 'admin' && (
              <div className="mt-6 pt-6 border-t border-slate-200 text-center">
                <span className="text-slate-600">Don't have an account? </span>
                <Link
                  to={type === 'lawyer' ? '/auth/lawyer/signup' : '/auth/citizen/signup'}
                  className="font-semibold text-lk-accent hover:underline"
                >
                  Register here
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Footer links */}
        {type !== 'admin' && (
          <div className="mt-6 text-center text-white/70 text-sm">
            {type === 'citizen' ? (
              <span>
                Are you a lawyer?{' '}
                <Link to="/auth/lawyer/login" className="font-semibold text-white hover:underline">
                  Login as Lawyer
                </Link>
              </span>
            ) : (
              <span>
                Are you a citizen?{' '}
                <Link to="/auth/citizen/login" className="font-semibold text-white hover:underline">
                  Login as Citizen
                </Link>
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
