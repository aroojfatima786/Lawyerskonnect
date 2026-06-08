import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth, useRole } from '../context/AuthContext';
import { authStorage } from '../utils/authStorage';

// Layouts
import { DashboardLayout } from '../components/layouts';

// Public pages
import Home from '../pages/Home/Home';
import RegisterChoice from '../pages/Home/RegisterChoice';
import About from '../pages/About/About';
import Contact from '../pages/Contact/Contact';
import Services from '../pages/Services/Services';
import HowItWorks from '../pages/HowItWorks/HowItWorks';

// Auth pages
import CitizenSignupModal from '../pages/auth/CitizenSignupModal';
import LawyerSignupModal from '../pages/auth/LawyerSignupModal';
import LawyerRegistrationPayment from '../pages/auth/LawyerRegistrationPayment';
import LoginPage from '../pages/auth/LoginPage';
import ForgotPassword from '../pages/auth/ForgotPassword';
import VerifyEmail from '../pages/auth/verify-email';
import GoogleCallbackHandler from '../pages/auth/GoogleCallbackHandler';

// Setup pages
import CompleteProfilePage from '../pages/setup/complete-setup';

// Dashboard pages
import CitizenDashboard from '../pages/dashboard/citizen';
import LawyerDashboard from '../pages/dashboard/lawyer';
import AdminDashboard from '../pages/dashboard/admin';

// Lawyer search pages
import SearchLawyers from '../pages/lawyers/SearchLawyers';
import LawyerProfile from '../pages/lawyers/LawyerProfile';

// Appointment pages
import MyAppointments from '../pages/appointments/MyAppointments';
import BookAppointment from '../pages/appointments/BookAppointment';

// Chat pages
import Messages from '../pages/messages/Messages';

// Payment pages
import PaymentHistory from '../pages/payments/PaymentHistory';
import Checkout from '../pages/payments/Checkout';

// Profile pages
import ProfileSettings from '../pages/profile/ProfileSettings';

// Notification pages
import Notifications from '../pages/notifications/Notifications';

// Admin pages
import AdminUsers from '../pages/admin/Users';
import AdminVerifications from '../pages/admin/Verifications';
import AdminPayments from '../pages/admin/Payments';
import AdminReviews from '../pages/admin/Reviews';
import AdminCategories from '../pages/admin/Categories';
import AdminComplaints from '../pages/admin/Complaints';
import AdminAnnouncements from '../pages/admin/Announcements';
import AdminChatViolations from '../pages/admin/ChatViolations';
import AdminLegalKnowledge from '../pages/admin/LegalKnowledge';
import AdminReports from '../pages/admin/Reports';
import HelpSupport from '../pages/support/HelpSupport';
import LegalGuidance from '../pages/legal-guidance/LegalGuidance';
import { CITIZEN_LEGAL_GUIDANCE_PATH, CITIZEN_LOGIN_FOR_GUIDANCE } from '../constants/legalGuidanceRoutes';

// Reviews page
import MyReviews from '../pages/reviews/MyReviews';

// Lawyer-specific pages
import Earnings from '../pages/lawyer/Earnings';
import LawyerSubscription from '../pages/lawyer/Subscription';

// Profile page: admin has no profile/payment settings, redirect to dashboard
function ProfileOrRedirect() {
  const { isAdmin } = useRole();
  if (isAdmin) return <Navigate to="/admin" replace />;
  return <ProfileSettings />;
}

// Protected route wrapper
function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode; allowedRoles?: string[] }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();
  // Also check configured auth storage for token (handles race condition after login)
  const hasToken = !!authStorage.getToken();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-lk-canvas">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-lk-accent border-t-transparent" />
      </div>
    );
  }

  // If token exists but user not loaded yet, show loading
  if (hasToken && !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-lk-canvas">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-lk-accent border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated && !hasToken) {
    // Admin URL par jaane par admin login dikhao, warna citizen login
    const loginPath = location.pathname.startsWith('/admin') ? '/auth/admin/login' : '/auth/citizen/login';
    return <Navigate to={loginPath} replace />;
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    const roleDashboard =
      user.role === 'admin' ? '/admin' : user.role === 'lawyer' ? '/lawyer/dashboard' : '/client/dashboard';
    return <Navigate to={roleDashboard} replace />;
  }

  if (
    user?.role === 'lawyer' &&
    user.lawyerRegistrationFeePaid === false &&
    !location.pathname.startsWith('/auth/lawyer/registration-payment')
  ) {
    return (
      <Navigate
        to="/auth/lawyer/registration-payment"
        replace
        state={{ userId: user._id, email: user.email }}
      />
    );
  }

  if (user?.role === 'lawyer' && !user?.isProfileComplete && location.pathname !== '/setup/complete-setup') {
    return <Navigate to="/setup/complete-setup" replace />;
  }

  return <>{children}</>;
}

// Dashboard redirect based on role
function DashboardRedirect() {
  const { user } = useAuth();
  const { isAdmin, isLawyer } = useRole();

  // Show loading if user not loaded yet
  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-lk-canvas">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-lk-accent border-t-transparent" />
      </div>
    );
  }

  if (isAdmin) {
    return <Navigate to="/admin" replace />;
  }

  if (isLawyer) {
    if (!user.isProfileComplete) {
      return <Navigate to="/setup/complete-setup" replace />;
    }
    return <Navigate to="/lawyer/dashboard" replace />;
  }

  return <Navigate to="/client/dashboard" replace />;
}

function LegalGuidancePublicRedirect() {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-lk-canvas">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-lk-accent border-t-transparent" />
      </div>
    );
  }

  if (isAuthenticated && user?.role === 'citizen') {
    return <Navigate to={CITIZEN_LEGAL_GUIDANCE_PATH} replace />;
  }

  return <Navigate to={CITIZEN_LOGIN_FOR_GUIDANCE.pathname} replace state={CITIZEN_LOGIN_FOR_GUIDANCE.state} />;
}

function SetupRouteGuard() {
  const { user, isLoading } = useAuth();
  if (isLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-lk-canvas">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-lk-accent border-t-transparent" />
      </div>
    );
  }
  const dashboardPath =
    user.role === 'admin' ? '/admin' : user.role === 'lawyer' ? '/lawyer/dashboard' : '/client/dashboard';
  if (user.role !== 'lawyer' || user.isProfileComplete) {
    return <Navigate to={dashboardPath} replace />;
  }
  return <CompleteProfilePage />;
}

export default function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<Home />} />
        <Route path="/register" element={<RegisterChoice />} />
        <Route path="/about" element={<About />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/services" element={<Services />} />
        <Route path="/how-it-works" element={<HowItWorks />} />
        <Route path="/legal-guidance" element={<LegalGuidancePublicRedirect />} />
        <Route path="/lawyers" element={<SearchLawyers />} />
        <Route path="/lawyers/:id" element={<LawyerProfile />} />

        {/* Auth routes */}
        <Route path="/auth/citizen/signup" element={<CitizenSignupModal />} />
        <Route path="/auth/lawyer/signup" element={<LawyerSignupModal />} />
        <Route path="/auth/lawyer/registration-payment" element={<LawyerRegistrationPayment />} />
        <Route path="/auth/:userType/login" element={<LoginPage />} />
        <Route path="/auth/forgot-password" element={<ForgotPassword />} />
        <Route path="/auth/verify-email" element={<VerifyEmail />} />
        <Route path="/auth/google/callback" element={<GoogleCallbackHandler />} />

        {/* Setup routes */}
        <Route
          path="/setup/complete-setup"
          element={
            <ProtectedRoute>
              <SetupRouteGuard />
            </ProtectedRoute>
          }
        />

        {/* Dashboard redirect: /dashboard -> role-based dashboard */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <DashboardRedirect />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />

        {/* ========== CLIENT (Citizen) routes: /client/* ========== */}
        <Route
          path="/client/dashboard"
          element={
            <ProtectedRoute allowedRoles={['citizen']}>
              <DashboardLayout>
                <CitizenDashboard />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/client/find-lawyer"
          element={
            <ProtectedRoute allowedRoles={['citizen']}>
              <DashboardLayout>
                <SearchLawyers />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/client/lawyers/:id"
          element={
            <ProtectedRoute allowedRoles={['citizen']}>
              <DashboardLayout>
                <LawyerProfile />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/client/appointments"
          element={
            <ProtectedRoute allowedRoles={['citizen']}>
              <DashboardLayout>
                <MyAppointments />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/client/appointments/book/:lawyerId"
          element={
            <ProtectedRoute allowedRoles={['citizen']}>
              <DashboardLayout>
                <BookAppointment />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/client/messages"
          element={
            <ProtectedRoute allowedRoles={['citizen']}>
              <DashboardLayout>
                <Messages />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/client/messages/:conversationId"
          element={
            <ProtectedRoute allowedRoles={['citizen']}>
              <DashboardLayout>
                <Messages />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/client/payments"
          element={
            <ProtectedRoute allowedRoles={['citizen']}>
              <DashboardLayout>
                <PaymentHistory />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/client/payments/checkout/:appointmentId"
          element={
            <ProtectedRoute allowedRoles={['citizen']}>
              <DashboardLayout>
                <Checkout />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/client/profile"
          element={
            <ProtectedRoute allowedRoles={['citizen']}>
              <DashboardLayout>
                <ProfileSettings />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/client/notifications"
          element={
            <ProtectedRoute allowedRoles={['citizen']}>
              <DashboardLayout>
                <Notifications />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/client/reviews"
          element={
            <ProtectedRoute allowedRoles={['citizen']}>
              <DashboardLayout>
                <MyReviews />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/client/support"
          element={
            <ProtectedRoute allowedRoles={['citizen']}>
              <DashboardLayout>
                <HelpSupport />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/client/legal-guidance"
          element={
            <ProtectedRoute allowedRoles={['citizen']}>
              <DashboardLayout>
                <LegalGuidance variant="dashboard" />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />

        {/* ========== LAWYER routes: /lawyer/* ========== */}
        <Route
          path="/lawyer/dashboard"
          element={
            <ProtectedRoute allowedRoles={['lawyer']}>
              <DashboardLayout>
                <LawyerDashboard />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/lawyer/appointments"
          element={
            <ProtectedRoute allowedRoles={['lawyer']}>
              <DashboardLayout>
                <MyAppointments />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/lawyer/messages"
          element={
            <ProtectedRoute allowedRoles={['lawyer']}>
              <DashboardLayout>
                <Messages />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/lawyer/messages/:conversationId"
          element={
            <ProtectedRoute allowedRoles={['lawyer']}>
              <DashboardLayout>
                <Messages />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/lawyer/profile"
          element={
            <ProtectedRoute allowedRoles={['lawyer']}>
              <DashboardLayout>
                <ProfileSettings />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/lawyer/notifications"
          element={
            <ProtectedRoute allowedRoles={['lawyer']}>
              <DashboardLayout>
                <Notifications />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/lawyer/reviews"
          element={
            <ProtectedRoute allowedRoles={['lawyer']}>
              <DashboardLayout>
                <MyReviews />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/lawyer/earnings"
          element={
            <ProtectedRoute allowedRoles={['lawyer']}>
              <DashboardLayout>
                <Earnings />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/lawyer/subscription"
          element={
            <ProtectedRoute allowedRoles={['lawyer']}>
              <DashboardLayout>
                <LawyerSubscription />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/lawyer/support"
          element={
            <ProtectedRoute allowedRoles={['lawyer']}>
              <DashboardLayout>
                <HelpSupport />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/lawyer/availability"
          element={<Navigate to="/lawyer/profile?tab=availability" replace />}
        />

        {/* Admin routes */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <DashboardLayout>
                <AdminDashboard />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/users"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <DashboardLayout>
                <AdminUsers />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/verifications"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <DashboardLayout>
                <AdminVerifications />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/payments"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <DashboardLayout>
                <AdminPayments />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/reports"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <DashboardLayout>
                <AdminReports />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/reviews"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <DashboardLayout>
                <AdminReviews />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/categories"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <DashboardLayout>
                <AdminCategories />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/complaints"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <DashboardLayout>
                <AdminComplaints />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/chat-violations"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <DashboardLayout>
                <AdminChatViolations />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/announcements"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <DashboardLayout>
                <AdminAnnouncements />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/legal-knowledge"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <DashboardLayout>
                <AdminLegalKnowledge />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />

        {/* Profile: redirect admin to dashboard (admin has no profile settings) */}
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <ProfileOrRedirect />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/notifications"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <Notifications />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />

        {/* Catch all - redirect to home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
