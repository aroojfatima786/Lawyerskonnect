import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './components/ui/Toast';
import AppRoutes from './routes/AppRoutes';
import GlobalNotificationPopup from './components/notifications/GlobalNotificationPopup';

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <GlobalNotificationPopup />
        <AppRoutes />
      </ToastProvider>
    </AuthProvider>
  );
}
