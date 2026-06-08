import { PaymentProvider, PaymentIntentResult, VerificationResult } from './payment-provider.interface';
import { PaymentDocument, PaymentMethod, PaymentStatus } from '../../schemas/payment.schema';
import { AppointmentDocument } from '../../schemas/appointment.schema';
import { UserDocument } from '../../schemas/user.schema';

export class ManualPaymentProvider implements PaymentProvider {
  getProviderName() {
    return 'manual' as const;
  }

  async createPaymentIntent(
    payment: PaymentDocument,
    _appointment: AppointmentDocument,
    _user: UserDocument,
    accountIdentifier?: string,
  ): Promise<PaymentIntentResult> {
    return {
      provider: 'manual',
      providerReference: payment.referenceNumber,
      gatewayInfo: this.getManualProviderInfo(payment.method, payment.amount, accountIdentifier),
      providerResponse: { mode: 'manual' },
    };
  }

  async verifyWebhook(): Promise<VerificationResult> {
    return {
      verified: false,
      status: PaymentStatus.PENDING,
      failureReason: 'Manual provider does not support webhooks',
    };
  }

  async verifyReturn(): Promise<VerificationResult> {
    return {
      verified: false,
      status: PaymentStatus.PENDING,
      failureReason: 'Manual provider does not support return verification',
    };
  }

  private getManualProviderInfo(method: PaymentMethod, amount: number, accountIdentifier?: string) {
    switch (method) {
      case PaymentMethod.JAZZCASH:
        return {
          gateway: 'JazzCash',
          instructions: `Send PKR ${amount} to JazzCash account 03001234567`,
          merchantCode: 'LK123456',
          accountToSend: accountIdentifier || '03001234567',
          providerType: 'manual',
        };
      case PaymentMethod.EASYPAISA:
        return {
          gateway: 'EasyPaisa',
          instructions: `Send PKR ${amount} to EasyPaisa account 03451234567`,
          merchantCode: 'LK789012',
          accountToSend: accountIdentifier || '03451234567',
          providerType: 'manual',
        };
      case PaymentMethod.CARD:
        return {
          gateway: 'Card Payment',
          instructions: 'Use your bank app to transfer to provided merchant details',
          supportedCards: ['Visa', 'MasterCard'],
          providerType: 'manual',
        };
      case PaymentMethod.BANK_TRANSFER:
        return {
          gateway: 'Bank Transfer',
          bankName: 'HBL',
          accountTitle: 'LawyersKonnect',
          accountNumber: '1234567890',
          instructions: `Transfer PKR ${amount} and share receipt`,
          providerType: 'manual',
        };
      default:
        return { providerType: 'manual' };
    }
  }
}
