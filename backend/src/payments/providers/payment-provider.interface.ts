import { PaymentDocument, PaymentStatus } from '../../schemas/payment.schema';
import { AppointmentDocument } from '../../schemas/appointment.schema';
import { UserDocument } from '../../schemas/user.schema';

export type SupportedPaymentProvider = 'manual' | 'jazzcash' | 'easypaisa' | 'card';

export interface PaymentIntentResult {
  provider: SupportedPaymentProvider;
  providerEnv?: string;
  providerReference?: string;
  checkoutUrl?: string;
  redirectFormPayload?: {
    method: 'GET' | 'POST';
    action: string;
    fields: Record<string, string>;
  };
  gatewayInfo?: Record<string, any>;
  providerResponse?: Record<string, any>;
}

export interface VerificationResult {
  /** @deprecated Use signatureValid + status; kept for non-Jazz providers */
  verified: boolean;
  /** true if pp_SecureHash (or future auth) matches — trust no amount/code until this is true */
  signatureValid?: boolean;
  /** When signatureValid, whether the gateway response code indicates a captured payment */
  gatewayPaymentSuccess?: boolean;
  status: PaymentStatus;
  providerTransactionId?: string;
  /** Bill / order reference; must match our referenceNumber for lookup */
  providerReference?: string;
  /** Amount in major units (e.g. PKR), normalized from paisa when applicable */
  amount?: number;
  amountPaisaRaw?: string;
  currency?: string;
  failureReason?: string;
  errorCode?: string;
  providerResponse?: Record<string, any>;
  idempotencyKey?: string;
}

export interface PaymentProvider {
  getProviderName(): SupportedPaymentProvider;
  createPaymentIntent(
    payment: PaymentDocument,
    appointment: AppointmentDocument,
    user: UserDocument,
    accountIdentifier?: string,
  ): Promise<PaymentIntentResult>;
  verifyWebhook(
    payload: Record<string, any>,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<VerificationResult>;
  verifyReturn(payloadOrQuery: Record<string, any>): Promise<VerificationResult>;
}
