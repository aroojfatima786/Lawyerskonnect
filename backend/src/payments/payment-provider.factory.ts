import { SupportedPaymentProvider } from './providers/payment-provider.interface';
import { PaymentProvider } from './providers/payment-provider.interface';
import { ManualPaymentProvider } from './providers/manual.provider';
import { JazzcashPaymentProvider } from './providers/jazzcash.provider';
import { EasypaisaPaymentProvider } from './providers/easypaisa.provider';
import { CardPaymentProvider } from './providers/card.provider';

export class PaymentProviderFactory {
  static resolveProviderNameFromEnv(): SupportedPaymentProvider {
    const provider = ((process.env.PAYMENT_PROVIDER || 'manual').trim().toLowerCase() ||
      'manual') as SupportedPaymentProvider;
    const supported: SupportedPaymentProvider[] = ['manual', 'jazzcash', 'easypaisa', 'card'];
    if (!supported.includes(provider)) {
      throw new Error('Unsupported PAYMENT_PROVIDER. Supported providers: manual, jazzcash, easypaisa, card');
    }
    return provider;
  }

  static create(provider: SupportedPaymentProvider): PaymentProvider {
    switch (provider) {
      case 'manual':
        return new ManualPaymentProvider();
      case 'jazzcash':
        return new JazzcashPaymentProvider();
      case 'easypaisa':
        return new EasypaisaPaymentProvider();
      case 'card':
        return new CardPaymentProvider();
      default:
        return new ManualPaymentProvider();
    }
  }
}
