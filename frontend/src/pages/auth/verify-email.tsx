import { useState, useEffect } from "react";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { Button } from "../../components/ui";
import { useToast } from "../../components/ui/Toast";
import { authApi } from "../../services/api";

const VerifyEmailPage = () => {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { login } = useAuth();
  const toast = useToast();

  // Get userId and email from navigation state
  const userId = location.state?.userId || searchParams.get('userId');
  const email = location.state?.email || searchParams.get('email');

  useEffect(() => {
    const codeFromQuery = searchParams.get('code');
    if (codeFromQuery && codeFromQuery.length === 6) {
      setCode(codeFromQuery);
    }
  }, [searchParams]);

  useEffect(() => {
    // If no userId/email, redirect to signup
    if (!userId && !email) {
      navigate('/register');
    }
  }, [userId, email, navigate]);

  useEffect(() => {
    if (location.state?.isLawyer) {
      sessionStorage.setItem('lk_lawyer_signup', '1');
    }
  }, [location.state?.isLawyer]);

  // Submit the verification code to the backend
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (code.length !== 6) {
      setErrorMsg('Please enter a valid 6-digit code.');
      return;
    }

    try {
      setLoading(true);
      
      const data: any = await authApi.verifyEmail(code, userId);

      setSuccessMsg('Email verified successfully!');
      toast.success('Email verified successfully!');

      const isLawyer =
        data?.role === 'lawyer' ||
        location.state?.isLawyer === true ||
        sessionStorage.getItem('lk_lawyer_signup') === '1';
      const registrationUnpaid =
        data?.requiresRegistrationPayment === true ||
        data?.lawyerRegistrationFeePaid === false ||
        (isLawyer && data?.lawyerRegistrationFeePaid !== true);

      if (isLawyer && registrationUnpaid) {
        sessionStorage.removeItem('lk_lawyer_signup');
        navigate('/auth/lawyer/registration-payment', {
          replace: true,
          state: {
            userId: data?.userId || userId,
            email: data?.email || email,
          },
        });
        return;
      }

      // If response includes token and user, log them in
      if (data.token && data.user) {
        login(data.token, data.user);
        
        const dashboardPath = data.user.role === 'admin' ? '/admin' : data.user.role === 'lawyer' ? '/lawyer/dashboard' : '/client/dashboard';
        setTimeout(() => {
          if (data.user.role === 'lawyer' && !data.user.isProfileComplete) {
            navigate('/setup/complete-setup', { replace: true });
          } else {
            navigate(dashboardPath, { replace: true });
          }
        }, 100);
      } else {
        // Redirect to login after verification
        setTimeout(() => {
          const isLawyerSignup = location.state?.isLawyer || false;
          navigate(isLawyerSignup ? '/auth/lawyer/login' : '/auth/citizen/login', { replace: true });
        }, 1000);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Handle resend code
  const handleResendCode = async () => {
    try {
      setLoading(true);
      setErrorMsg('');
      
      await authApi.resendVerification(userId || '');
      toast.success('Verification code resent to your email');
      setSuccessMsg('Verification code resent!');
    } catch (err) {
      setErrorMsg('Failed to resend code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Handle input change for individual digits
  const handleCodeChange = (index: number, value: string) => {
    if (value.length > 1) {
      // Handle paste
      const pastedCode = value.replace(/\D/g, '').slice(0, 6);
      setCode(pastedCode);
      return;
    }
    
    const newCode = code.split("");
    newCode[index] = value.replace(/\D/g, '');
    setCode(newCode.join(""));

    // Auto-focus next input
    if (value && index < 5) {
      const nextInput = document.getElementById(`code-input-${index + 1}`);
      nextInput?.focus();
    }
  };

  // Handle backspace
  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      const prevInput = document.getElementById(`code-input-${index - 1}`);
      prevInput?.focus();
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-lk-navy via-slate-900 to-slate-950 px-4 py-6">
      <div className="w-full max-w-md rounded-2xl border border-lk-border bg-lk-surface p-4 shadow-lk-card-lg sm:p-8">
        <div className="text-center mb-6">
          <img
            src="/image.png"
            alt="LawyersKonnect"
            className="mx-auto mb-4 h-14 w-14 rounded-full border-[3px] border-[#f0a31c] object-cover shadow-md sm:h-16 sm:w-16"
          />
          <h2 className="text-xl sm:text-2xl font-bold text-lk-navy">Verify Your Email</h2>
          <p className="text-slate-600 mt-2 text-xs sm:text-sm">
            Enter the 6-digit code we sent to
          </p>
          <p className="text-xs sm:text-sm font-semibold text-lk-accent break-all">{email || 'your email'}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
          {/* Verification Code Input */}
          <div className="flex justify-center gap-1 sm:gap-2">
            {[...Array(6)].map((_, index) => (
              <input
                key={index}
                id={`code-input-${index}`}
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={code[index] || ""}
                onChange={(e) => handleCodeChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                className="w-10 sm:w-12 h-12 sm:h-14 text-center text-lg sm:text-xl font-bold border-2 border-lk-border rounded-lg sm:rounded-xl focus:outline-none focus:border-lk-accent focus:ring-2 focus:ring-lk-accent/20 transition-all"
                disabled={loading}
              />
            ))}
          </div>

          {/* Error and Success Messages */}
          {errorMsg && (
            <p className="text-red-600 text-center text-xs sm:text-sm bg-red-50 p-2 sm:p-3 rounded-lg">{errorMsg}</p>
          )}
          {successMsg && (
            <p className="text-green-600 text-center text-xs sm:text-sm bg-green-50 p-2 sm:p-3 rounded-lg">{successMsg}</p>
          )}

          {/* Submit Button */}
          <Button type="submit" disabled={loading || code.length !== 6} className="w-full" size="lg" isLoading={loading}>
            Verify Email
          </Button>
        </form>

        <div className="text-center mt-4 sm:mt-6 text-xs sm:text-sm text-slate-600">
          <p>
            Didn't receive the code?{" "}
            <button 
              onClick={handleResendCode}
              disabled={loading}
              className="font-semibold text-lk-accent hover:underline disabled:opacity-60"
            >
              Resend Code
            </button>
          </p>
        </div>

        <div className="text-center mt-3 sm:mt-4">
          <button
            onClick={() => navigate('/register')}
            className="text-xs sm:text-sm text-slate-500 hover:text-slate-700"
          >
            ← Back to Register
          </button>
        </div>
      </div>
    </div>
  );
};

export default VerifyEmailPage;
