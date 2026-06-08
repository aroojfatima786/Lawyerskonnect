import { BadRequestException, Logger } from '@nestjs/common';
import { PaymentProvider, PaymentIntentResult, VerificationResult } from './payment-provider.interface';
import { PaymentDocument, PaymentStatus } from '../../schemas/payment.schema';
import { AppointmentDocument } from '../../schemas/appointment.schema';
import { UserDocument } from '../../schemas/user.schema';

/**
 * Card payments (e.g. Stripe) — not implemented in this codebase until a PSP SDK is wired.
 * We never return a fake checkout session or mark success. Configure manual / JazzCash / EasyPaisa for demos.
 */
export const CARD_ERROR_NOT_CONFIGURED = 'PAYMENT_PROVIDER_NOT_CONFIGURED';

export class CardPaymentProvider implements PaymentProvider {
  private readonly logger = new Logger(CardPaymentProvider.name);

  getProviderName() {
    return 'card' as const;
  }

  assertConfigured(): void {
    const provider = (process.env.CARD_PROVIDER || '').trim();
    const secret = (process.env.CARD_SECRET_KEY || '').trim();
    const webhookSecret = (process.env.CARD_WEBHOOK_SECRET || '').trim();
    const returnUrl = (process.env.CARD_RETURN_URL || '').trim();
    const webhookUrl = (process.env.CARD_WEBHOOK_URL || '').trim();
    const miss: string[] = [];
    if (!provider) miss.push('CARD_PROVIDER');
    if (!secret) miss.push('CARD_SECRET_KEY');
    if (!webhookSecret) miss.push('CARD_WEBHOOK_SECRET');
    if (!returnUrl) miss.push('CARD_RETURN_URL');
    if (!webhookUrl) miss.push('CARD_WEBHOOK_URL');
    if (miss.length) {
      throw new BadRequestException({
        code: CARD_ERROR_NOT_CONFIGURED,
        message: `Card payment is not fully configured. Missing: ${miss.join(', ')}`,
      });
    }
  }

  async createPaymentIntent(
    _payment: PaymentDocument,
    _appointment: AppointmentDocument,
    _user: UserDocument,
  ): Promise<PaymentIntentResult> {
    this.assertConfigured();
    this.logger.log('Card payment intent requested but no PSP (e.g. Stripe) integration is active in this build');
    // No session URL, no clientSecret — do not fabricate a successful redirect
    throw new BadRequestException({
      code: CARD_ERROR_NOT_CONFIGURED,
      message:
        'Card checkout is not enabled in this build. Use PAYMENT_PROVIDER=manual, jazzcash, or easypaisa, or implement your CARD_PROVIDER (e.g. Stripe) integration.',
    });
  }

  async verifyWebhook(): Promise<VerificationResult> {
    return {
      verified: false,
      signatureValid: false,
      status: PaymentStatus.PENDING,
      failureReason: 'Card provider webhook is not implemented',
    };
  }

  async verifyReturn(): Promise<VerificationResult> {
    return {
      verified: false,
      signatureValid: false,
      status: PaymentStatus.PENDING,
      failureReason: 'Card provider return is not implemented',
    };
  }
}
