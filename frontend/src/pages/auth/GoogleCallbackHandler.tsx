import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/ui/Toast';

/**
 * GoogleCallbackHandler
 * Handles the Google OAuth callback after user authenticates with Google
 * - Extracts token and user from URL params
 * - Stores token in localStorage
 * - Loads user into AuthContext
 * - Redirects to appropriate dashboard based on role and profile completion
 */
export default function GoogleCallbackHandler() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  
  // Use ref to ensure callback logic only runs once
  const hasProcessed = useRef(false);

  useEffect(() => {
    // Prevent multiple executions of the callback logic
    if (hasProcessed.current) {
      return;
    }

    const token = searchParams.get('token');
    const userParam = searchParams.get('user');

    // Validate we have both token and user data
    if (!token || !userParam) {
      toast.error('Invalid OAuth callback: missing token or user data');
      console.error('Google callback missing token or user data');
      navigate('/auth/citizen/login', { replace: true });
      return;
    }

    try {
      // Mark as processed before executing to prevent race conditions
      hasProcessed.current = true;

      // Decode and parse user data from URL param
      const user = JSON.parse(decodeURIComponent(userParam));

      // Validate user object has required fields
      if (!user._id || !user.email || !user.role) {
        throw new Error('Invalid user data from OAuth callback');
      }

      // Store in AuthContext and localStorage
      login(token, user);
      toast.success('Signed in with Google!');

      // Redirect based on role and profile completion
      // Small delay ensures state is updated before navigation
      setTimeout(() => {
        if (user.role === 'lawyer' && user.lawyerRegistrationFeePaid === false) {
          navigate('/auth/lawyer/registration-payment', {
            replace: true,
            state: { userId: user._id, email: user.email },
          });
        } else if (user.role === 'lawyer' && !user.isProfileComplete) {
          navigate('/setup/complete-setup', { replace: true });
        } else if (user.role === 'admin') {
          navigate('/admin', { replace: true });
        } else if (user.role === 'lawyer') {
          navigate('/lawyer/dashboard', { replace: true });
        } else {
          // citizen or default
          navigate('/client/dashboard', { replace: true });
        }
      }, 100);
    } catch (error) {
      hasProcessed.current = false; // Reset on error to allow retry
      const message = error instanceof Error ? error.message : 'Failed to process Google login';
      toast.error(message);
      console.error('Google callback error:', error);
      navigate('/auth/citizen/login', { replace: true });
    }
  }, [searchParams, navigate, login, toast]);

  // Show loading state while processing
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-lk-accent border-t-transparent mx-auto mb-4" />
        <p className="text-slate-600">Completing Google login...</p>
      </div>
    </div>
  );
}
