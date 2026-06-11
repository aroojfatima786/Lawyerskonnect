// Must be backend URL so uploads and API calls hit the server, not Vite dev server
import { authStorage } from '../utils/authStorage';
import { getApiBaseUrl } from '../config/apiBase';

const API_BASE = getApiBaseUrl();

interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
}

class ApiService {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private getToken(): string | null {
    return authStorage.getToken();
  }

  private buildUrl(endpoint: string, params?: Record<string, string | number | boolean | undefined>): string {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          url.searchParams.append(key, String(value));
        }
      });
    }
    
    return url.toString();
  }

  private async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const { params, ...fetchOptions } = options;
    const url = this.buildUrl(endpoint, params);
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.headers || {}),
    };

    const token = this.getToken();
    if (token) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      ...fetchOptions,
      headers,
      credentials: 'include',
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const rawMessage = data.message;
      const message = Array.isArray(rawMessage)
        ? rawMessage.join('. ')
        : rawMessage || 'Something went wrong';
      throw {
        status: response.status,
        message,
        ...data,
      };
    }

    return data;
  }

  // GET request
  get<T>(endpoint: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET', params });
  }

  // POST request
  post<T>(endpoint: string, body?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  // PATCH request
  patch<T>(endpoint: string, body?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  // DELETE request
  delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }

  // Upload file (do not set Content-Type so browser sets multipart/form-data with boundary)
  async upload<T>(endpoint: string, formData: FormData): Promise<T> {
    const token = this.getToken();
    const headers: HeadersInit = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const base = this.baseUrl || getApiBaseUrl();
    const url = base.startsWith('http') ? `${base.replace(/\/$/, '')}${endpoint}` : `${getApiBaseUrl()}${endpoint}`;
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: formData,
      credentials: 'include',
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message = response.status === 404
        ? 'Upload endpoint not found. Check VITE_API_BASE_URL and that the API is reachable: ' + (this.baseUrl || getApiBaseUrl())
        : (data.message || 'Upload failed');
      throw { status: response.status, message, ...data };
    }

    return data;
  }
}

export const api = new ApiService(API_BASE);

// Public (no auth)
export const publicApi = {
  getStats: () => api.get('/public/stats'),
  submitContact: (body: { name: string; email: string; subject: string; message: string }) =>
    api.post('/public/contact', body),
  legalChat: (
    payload: {
      message?: string;
      language?: 'english' | 'urdu' | 'roman_urdu';
      location?: string;
      latitude?: number;
      longitude?: number;
      maxBudget?: number;
      preferredPracticeArea?: string;
      caseText?: string;
    },
    file?: File,
  ) => {
    if (file) {
      const formData = new FormData();
      formData.append('file', file);
      if (payload.message) formData.append('message', payload.message);
      if (payload.language) formData.append('language', payload.language);
      if (payload.location) formData.append('location', payload.location);
      if (payload.latitude != null) formData.append('latitude', String(payload.latitude));
      if (payload.longitude != null) formData.append('longitude', String(payload.longitude));
      if (payload.maxBudget != null) formData.append('maxBudget', String(payload.maxBudget));
      if (payload.preferredPracticeArea) formData.append('preferredPracticeArea', payload.preferredPracticeArea);
      if (payload.caseText) formData.append('caseText', payload.caseText);
      return api.upload('/public/ai/legal-chat', formData);
    }
    return api.post('/public/ai/legal-chat', payload);
  },
  getLegalChatHistory: () => api.get('/public/ai/legal-chat/history'),
};

// Auth API
export const authApi = {
  signup: (email: string, password: string) =>
    api.post('/auth/signup', { email, password }),
  
  lawyerSignup: (email: string, password: string) =>
    api.post('/auth/lawyer/signup', { email, password }),

  citizenSignin: (email: string, password: string) =>
    api.post('/auth/citizen/signin', { email, password }),
  
  lawyerSignin: (email: string, password: string) =>
    api.post('/auth/lawyer/signin', { email, password }),
  
  adminSignin: (email: string, password: string) =>
    api.post('/auth/admin/signin', { email, password }),
  
  verifyEmail: (code: string, userId?: string) =>
    api.post('/auth/verify-email', { code, userId }),

  resendVerification: (userId: string) =>
    api.post('/auth/resend-verification', { userId }),
  
  verifyOtp: (email: string, code: string, role?: string) =>
    api.post('/auth/verify-otp', { email, code, role }),
  
  resendOtp: (email: string, role?: string) =>
    api.post('/auth/resend-otp', { email, role }),
  
  forgotPassword: (email: string) =>
    api.post('/auth/forgot-password', { email }),
  
  verifyResetCode: (email: string, code: string) =>
    api.post('/auth/verify-reset-code', { email, code }),
  
  resetPassword: (email: string, code: string, newPassword: string) =>
    api.post('/auth/reset-password', { email, code, newPassword }),
  
  changePassword: (currentPassword: string, newPassword: string) =>
    api.patch('/auth/change-password', { currentPassword, newPassword }),
  
  completeProfile: (data: any) =>
    api.post('/auth/complete-profile', data),

  /** @deprecated Legacy path — stores URLs on profile only. Use identityApi.uploadDocument + submitVerification instead. */
  uploadVerificationDocument: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.upload<{ success: boolean; url: string; filename: string }>('/auth/upload-verification-document', formData);
  },

  getCurrentUser: () =>
    api.get('/auth/me'),

  logout: () =>
    api.post('/auth/logout'),
};

export const registrationApi = {
  getFee: () => api.get('/auth/lawyer/registration/fee'),

  getStatus: (userId: string) => api.get(`/auth/lawyer/registration/status/${userId}`),

  checkout: (payload: {
    userId: string;
    method: string;
    accountIdentifier?: string;
    stripeCheckout?: boolean;
  }) => api.post('/auth/lawyer/registration/checkout', payload),

  confirmPayment: (paymentId: string, userId: string, transactionId?: string) =>
    api.post(`/auth/lawyer/registration/payments/${paymentId}/confirm`, {
      userId,
      transactionId,
      success: true,
    }),

  createStripeSession: (payload: {
    userId: string;
    paymentId: string;
    amount: number;
    walletMethod?: 'jazzcash' | 'easypaisa';
  }) => api.post('/auth/lawyer/registration/stripe-session', payload),

  syncStripePayment: (userId: string) =>
    api.post('/auth/lawyer/registration/sync-stripe', { userId }),
};

// Lawyer API
export const lawyerApi = {
  search: (filters: Record<string, any>) =>
    api.get('/lawyers', filters),
  
  getById: (id: string) =>
    api.get(`/lawyers/${id}`),
  
  getAvailability: (id: string, date: string) =>
    api.get(`/lawyers/${id}/availability`, { date }),
  
  getCategories: () =>
    api.get('/lawyers/categories'),
  
  getCities: () =>
    api.get('/lawyers/cities'),
  
  updateProfile: (data: any) =>
    api.patch('/lawyers/profile', data),
  
  updateAvailability: (availability: any[]) =>
    api.patch('/lawyers/availability', { availability }),
};

// Appointment API
export const appointmentApi = {
  create: (data: any) =>
    api.post('/appointments', data),
  
  getCitizenAppointments: (params?: Record<string, any>) =>
    api.get('/appointments/citizen', params),
  
  getLawyerAppointments: (params?: Record<string, any>) =>
    api.get('/appointments/lawyer', params),
  
  getUpcoming: (limit?: number) =>
    api.get('/appointments/upcoming', { limit }),
  
  getStats: () =>
    api.get('/appointments/stats'),
  
  getById: (id: string) =>
    api.get(`/appointments/${id}`),
  
  confirm: (id: string, meetingLink?: string) =>
    api.patch(`/appointments/${id}/confirm`, { meetingLink }),
  
  cancel: (id: string, reason: string) =>
    api.patch(`/appointments/${id}/cancel`, { reason }),
  
  reschedule: (id: string, newDate: string, newStartTime: string, reason: string) =>
    api.patch(`/appointments/${id}/reschedule`, { newDate, newStartTime, reason }),
  
  complete: (id: string, notes?: string) =>
    api.patch(`/appointments/${id}/complete`, { notes }),
  
  updateMeetingLink: (id: string, meetingLink: string, meetingPassword?: string) =>
    api.patch(`/appointments/${id}/meeting-link`, { meetingLink, meetingPassword }),
};

// Review API
export const reviewApi = {
  create: (data: { lawyerId: string; rating: number; comment?: string; appointmentId?: string }) =>
    api.post('/reviews', data),
  
  getLawyerReviews: (lawyerId: string, page?: number, limit?: number) =>
    api.get(`/reviews/lawyer/${lawyerId}`, { page, limit }),
  
  getMyReviews: () =>
    api.get('/reviews/my-reviews'),

  getMyLawyerReviews: () =>
    api.get('/reviews/lawyer/me'),
  
  update: (id: string, data: { rating?: number; comment?: string }) =>
    api.patch(`/reviews/${id}`, data),
  
  delete: (id: string) =>
    api.delete(`/reviews/${id}`),
  
  toggleReviewVisibility: (id: string, adminNote?: string) =>
    api.patch(`/reviews/${id}/visibility`, { adminNote }),
};

// Payment API
export const paymentApi = {
  initiate: (appointmentId: string, method: string, accountIdentifier?: string) =>
    api.post('/payments/initiate', { appointmentId, method, accountIdentifier }),
  
  confirm: (id: string, transactionId?: string) =>
    api.post(`/payments/${id}/confirm`, { transactionId }),
  
  getById: (id: string) =>
    api.get(`/payments/${id}`),
  
  getPayments: (params?: Record<string, any>) =>
    api.get('/payments', params),
  
  getHistory: (page?: number, limit?: number) =>
    api.get('/payments', { page, limit }),

  async downloadInvoice(paymentId: string): Promise<void> {
    const id = String(paymentId || '').trim();
    if (!id) {
      throw new Error('Invalid payment id');
    }

    const base = getApiBaseUrl();
    const token = authStorage.getToken();
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};

    const readErrorMessage = async (res: Response): Promise<string> => {
      try {
        const errJson = await res.json();
        const msg = errJson?.message;
        if (Array.isArray(msg)) return msg.join('. ');
        if (typeof msg === 'string' && msg.trim()) return msg;
      } catch {
        /* not JSON */
      }
      return `Download failed (${res.status})`;
    };

    let res = await fetch(`${base}/payments/${id}/invoice/pdf`, {
      headers,
      credentials: 'include',
    });
    let extension = 'pdf';

    if (!res.ok) {
      const pdfError = await readErrorMessage(res);
      res = await fetch(`${base}/payments/${id}/invoice`, {
        headers,
        credentials: 'include',
      });
      extension = 'html';
      if (!res.ok) {
        const htmlError = await readErrorMessage(res);
        throw new Error(htmlError || pdfError);
      }
    }

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      throw new Error(await readErrorMessage(res));
    }

    const blob = await res.blob();
    if (!blob.size) {
      throw new Error('Invoice file is empty');
    }

    const disposition = res.headers.get('content-disposition') || '';
    const filenameMatch = disposition.match(/filename="?([^";]+)"?/i);
    const filename = filenameMatch?.[1] || `invoice-${id}.${extension}`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  /** Demo-safe labeling for checkout (citizen): manual vs gateways; no secrets */
  getCitizenCheckoutContext: () =>
    api.get<{ success: boolean; data: Record<string, unknown> }>('/payments/citizen-checkout-context'),

  createStripeSession: (payload: {
    amount: number;
    currency: string;
    orderId: string;
    userId: string;
    walletMethod?: 'jazzcash' | 'easypaisa';
    checkoutType?: 'appointment' | 'subscription' | 'registration';
  }) => api.post<{ success: boolean; sessionUrl: string; sessionId: string; paymentId: string }>(
    '/payment/stripe/create-session',
    payload,
  ),

  syncStripeConsultation: (payload: { appointmentId?: string; paymentId?: string }) =>
    api.post<{ synced: boolean; completed: boolean; reason?: string; paymentId?: string }>(
      '/payment/stripe/sync-session',
      payload,
    ),

  getAdminPayouts: (filters?: Record<string, any>) =>
    api.get('/payments/admin/payouts', filters),

  releaseAdminPayout: (payoutId: string, body?: { externalTransferReference?: string; notes?: string }) =>
    api.post(`/payments/admin/payouts/${payoutId}/release`, body || {}),

  markAdminPayoutFailed: (payoutId: string, failureReason?: string) =>
    api.post(`/payments/admin/payouts/${payoutId}/mark-failed`, { failureReason }),
};

// Lawyer subscription API
export const subscriptionApi = {
  getPlans: (billingCycle?: 'monthly' | 'yearly') =>
    api.get('/lawyers/me/subscription/plans', billingCycle ? { billingCycle } : undefined),

  getMySubscription: () => api.get('/lawyers/me/subscription'),

  getUsage: () => api.get('/lawyers/me/subscription/usage'),

  checkoutSubscription: (payload: {
    planCode: 'professional' | 'premium';
    billingCycle: 'monthly' | 'yearly';
    method: string;
    accountIdentifier?: string;
    stripeCheckout?: boolean;
  }) => api.post('/lawyers/me/subscription/checkout', payload),

  confirmSubscriptionPayment: (paymentId: string, transactionId?: string) =>
    api.post(`/lawyers/me/subscription/payments/${paymentId}/confirm`, {
      transactionId,
      success: true,
    }),

  cancelSubscription: () => api.post('/lawyers/me/subscription/cancel', {}),

  getSubscriptionPayments: (params?: { page?: number; limit?: number }) =>
    api.get('/lawyers/me/subscription/payments', params),

  adminListSubscriptions: (params?: Record<string, string | number | boolean | undefined>) =>
    api.get('/admin/subscriptions', params),

  adminUpdateSubscription: (
    id: string,
    payload: {
      action: 'activate' | 'expire' | 'cancel' | 'mark_failed';
      planCode?: string;
      billingCycle?: string;
      days?: number;
    },
  ) => api.patch(`/admin/subscriptions/${id}`, payload),
};

// Chat API
export const chatApi = {
  getConversations: () =>
    api.get('/chat/conversations'),
  
  getMessages: (conversationId: string, page?: number, limit?: number) =>
    api.get(`/chat/conversations/${conversationId}/messages`, { page, limit }),
  
  uploadAttachment: (receiverId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('receiverId', receiverId);
    return api.upload<{ success: boolean; data: { filename: string; originalName: string; mimeType: string; size: number; url: string } }>(
      '/chat/upload-attachment',
      formData,
    );
  },

  sendMessage: (receiverId: string, content?: string, attachments?: any[]) =>
    api.post('/chat/send', { receiverId, content, attachments }),
  
  markAsRead: (conversationId: string) =>
    api.post(`/chat/conversations/${conversationId}/read`),

  hideConversation: (conversationId: string) =>
    api.delete(`/chat/conversations/${conversationId}/hide`),

  deleteMessage: (messageId: string) =>
    api.delete(`/chat/messages/${messageId}`),

  editMessage: (messageId: string, content: string) =>
    api.patch(`/chat/messages/${messageId}`, { content }),
  
  getUnreadCount: () =>
    api.get('/chat/unread-count'),
  
  getConversationWithUser: (userId: string) =>
    api.get(`/chat/conversation-with/${userId}`),
};

// Notification API
export const notificationApi = {
  getAll: (page?: number, limit?: number, unreadOnly?: boolean) =>
    api.get('/notifications', { page, limit, unreadOnly }),
  
  getUnreadCount: () =>
    api.get('/notifications/unread-count'),
  
  getPreferences: () =>
    api.get('/notifications/preferences'),
  
  setPreferences: (prefs: { inApp?: boolean; email?: boolean; sms?: boolean }) =>
    api.patch('/notifications/preferences', prefs),
  
  markAsRead: (id: string) =>
    api.patch(`/notifications/${id}/read`),
  
  markAllAsRead: () =>
    api.patch('/notifications/read-all'),
  
  delete: (id: string) =>
    api.delete(`/notifications/${id}`),
  
  deleteAll: () =>
    api.delete('/notifications'),
};

// Complaints / Help & Support API (citizen + lawyer)
export const complaintApi = {
  create: (data: { subject: string; message: string; category?: string }) =>
    api.post('/complaints', data),
  getMy: (page?: number, limit?: number) =>
    api.get('/complaints/my', { page, limit }),
  getById: (id: string) =>
    api.get(`/complaints/${id}`),
};

// Admin API
export const adminApi = {
  getDashboard: () =>
    api.get('/admin/dashboard'),
  
  getAnalytics: (period?: 'week' | 'month' | 'year') =>
    api.get('/admin/analytics', { period }),

  getIntegrationsOverview: () =>
    api.get('/admin/integrations/overview'),
  
  getUsers: (filters?: Record<string, any>) =>
    api.get('/admin/users', filters),
  
  getUserById: (id: string) =>
    api.get(`/admin/users/${id}`),
  
  updateUserStatus: (id: string, isActive: boolean) =>
    api.patch(`/admin/users/${id}/status`, { isActive }),
  
  deleteUser: (id: string) =>
    api.delete(`/admin/users/${id}`),
  
  /** @deprecated Legacy admin verification — use identityApi.getPendingVerifications + reviewVerification. */
  getPendingVerifications: (page?: number, limit?: number) =>
    api.get('/admin/lawyers/pending', { page, limit }),
  
  /** @deprecated Legacy admin verification — use identityApi.reviewVerification. */
  verifyLawyer: (id: string, approved: boolean, rejectionReason?: string) =>
    api.patch(`/admin/lawyers/${id}/verify`, { approved, rejectionReason }),
  
  getCategories: () =>
    api.get('/admin/categories'),
  
  createCategory: (data: { name: string; description?: string; icon?: string }) =>
    api.post('/admin/categories', data),
  
  updateCategory: (id: string, data: any) =>
    api.patch(`/admin/categories/${id}`, data),
  
  deleteCategory: (id: string) =>
    api.delete(`/admin/categories/${id}`),
  
  seedCategories: () =>
    api.post('/admin/categories/seed'),
  
  getReviews: (filters?: Record<string, any>) =>
    api.get('/admin/reviews', filters),
  
  deleteReview: (id: string) =>
    api.delete(`/admin/reviews/${id}`),
  
  getAllPayments: (filters?: Record<string, any>) =>
    api.get('/payments/admin/all', filters),

  getPlatformWallet: () =>
    api.get('/payments/admin/wallet'),

  getPayouts: (filters?: Record<string, any>) =>
    api.get('/payments/admin/payouts', filters),

  releasePayoutToLawyer: (
    payoutId: string,
    payload?: { externalTransferReference?: string; notes?: string },
  ) => api.post(`/payments/admin/payouts/${payoutId}/release`, payload || {}),

  getLegalKnowledge: (params?: Record<string, any>) =>
    api.get('/admin/legal-knowledge', params),
  getLegalKnowledgeById: (id: string) =>
    api.get(`/admin/legal-knowledge/${id}`),
  createLegalKnowledge: (payload: any) =>
    api.post('/admin/legal-knowledge', payload),
  updateLegalKnowledge: (id: string, payload: any) =>
    api.patch(`/admin/legal-knowledge/${id}`, payload),
  deleteLegalKnowledge: (id: string) =>
    api.delete(`/admin/legal-knowledge/${id}`),
  
  processRefund: (id: string, reason: string) =>
    api.post(`/payments/${id}/refund`, { reason }),
  
  getReports: (type: string, startDate: string, endDate: string) =>
    api.get(`/admin/reports/${type}`, { startDate, endDate }),

  getComplaints: (filters?: { status?: string; category?: string; page?: number; limit?: number }) =>
    api.get('/admin/complaints', filters),
  getComplaintById: (id: string) =>
    api.get(`/admin/complaints/${id}`),
  updateComplaint: (id: string, data: { status?: string; adminReply?: string }) =>
    api.patch(`/admin/complaints/${id}`, data),
  getChatViolations: (filters?: {
    violationType?: string;
    senderId?: string;
    appointmentId?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }) => api.get('/admin/chat-violations', filters),

  createAnnouncement: (data: {
    title: string;
    message: string;
    targetRole?: 'citizen' | 'lawyer' | 'admin' | 'all';
    actionUrl?: string;
  }) =>
    api.post('/admin/announcements', data),

  /** Download report as CSV (UC-10). Fetches with auth and triggers file download. */
  async downloadReportsCsv(
    type: 'users' | 'appointments' | 'revenue',
    startDate: string,
    endDate: string,
  ): Promise<void> {
    const base = getApiBaseUrl();
    const token = authStorage.getToken();
    const q = new URLSearchParams({ type, startDate, endDate });
    const url = `${base}/admin/reports/export/csv?${q.toString()}`;
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    });
    if (!res.ok) throw new Error(res.statusText || 'Download failed');
    const blob = await res.blob();
    const name = `report-${type}-${startDate}-to-${endDate}.csv`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  },
};

// Identity API (KYC document verification)
export const identityApi = {
  uploadDocument: (documentType: string, file: File) => {
    const formData = new FormData();
    formData.append('documentType', documentType);
    formData.append('file', file);
    return api.upload('/identity/upload', formData);
  },

  getMyDocuments: () =>
    api.get('/identity/my-documents'),

  deleteDocument: (documentId: string) =>
    api.delete(`/identity/${documentId}`),

  submitVerification: () =>
    api.post('/identity/submit'),

  runAutomatedCheck: (cnic?: string) =>
    api.post('/identity/automated-check', cnic ? { cnic } : {}),

  getPendingVerifications: () =>
    api.get('/identity/admin/verification-requests'),

  reviewVerification: (userId: string, action: 'approve' | 'reject', rejectionReason?: string) =>
    api.post(`/identity/admin/review/${userId}`, { action, rejectionReason }),
};

export default api;
