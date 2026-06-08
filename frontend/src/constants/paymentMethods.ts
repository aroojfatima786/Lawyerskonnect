/** Wallet methods shown in citizen/lawyer checkout UI */
export const WALLET_PAYMENT_METHODS = [
  {
    id: 'jazzcash',
    name: 'JazzCash',
    subtitle: 'Mobile wallet payment',
    iconSrc: '/icons/jazzcash.svg',
    badge: 'JC',
    accent: 'from-rose-600 to-red-700',
    selectedRing: 'ring-rose-500/30',
    selectedBorder: 'border-rose-400',
    selectedBg: 'bg-gradient-to-br from-rose-50 to-white',
  },
  {
    id: 'easypaisa',
    name: 'EasyPaisa',
    subtitle: 'Mobile wallet payment',
    iconSrc: '/icons/easypaisa.svg',
    badge: 'EP',
    accent: 'from-emerald-600 to-green-700',
    selectedRing: 'ring-emerald-500/30',
    selectedBorder: 'border-emerald-400',
    selectedBg: 'bg-gradient-to-br from-emerald-50 to-white',
  },
] as const;

export type WalletPaymentMethodId = (typeof WALLET_PAYMENT_METHODS)[number]['id'];
