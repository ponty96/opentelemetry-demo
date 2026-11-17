// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import type { DeliveryMethod, PaymentMethodType } from '../protos/demo';

// Mirrors the proto enums; importing them at runtime would pull grpc-js into the browser bundle.
const PaymentMethodTypes = {
  CARD: 1 as PaymentMethodType,
  APPLE_PAY: 2 as PaymentMethodType,
  GOOGLE_PAY: 3 as PaymentMethodType,
  PAYPAL: 4 as PaymentMethodType,
  CRYPTO: 5 as PaymentMethodType,
  BNPL: 6 as PaymentMethodType,
};
const DeliveryMethods = {
  STANDARD: 1 as DeliveryMethod,
  EXPRESS: 2 as DeliveryMethod,
  SAME_DAY: 3 as DeliveryMethod,
  PICKUP: 4 as DeliveryMethod,
};

export type TPaymentMethod = 'card' | 'apple_pay' | 'google_pay' | 'paypal' | 'crypto' | 'bnpl';
export type TDeliveryMethod = 'standard' | 'express' | 'same_day' | 'pickup';
export type TUserTier = 'standard' | 'plus' | 'business';
export type TPlatform = 'web' | 'ios' | 'android';

export interface ISegment {
  tier: TUserTier;
  country: string;
  paymentMethod: TPaymentMethod;
  cardNetwork: string;
  deliveryMethod: TDeliveryMethod;
}

export const COUNTRIES: { code: string; name: string; region: string }[] = [
  { code: 'US', name: 'United States', region: 'na' },
  { code: 'CA', name: 'Canada', region: 'na' },
  { code: 'GB', name: 'United Kingdom', region: 'eu' },
  { code: 'DE', name: 'Germany', region: 'eu' },
  { code: 'NG', name: 'Nigeria', region: 'africa' },
  { code: 'BR', name: 'Brazil', region: 'latam' },
  { code: 'JP', name: 'Japan', region: 'apac' },
  { code: 'IN', name: 'India', region: 'apac' },
];

export const PAYMENT_METHODS: { value: TPaymentMethod; label: string; type: PaymentMethodType }[] = [
  { value: 'card', label: 'Credit or debit card', type: PaymentMethodTypes.CARD },
  { value: 'apple_pay', label: 'Apple Pay', type: PaymentMethodTypes.APPLE_PAY },
  { value: 'google_pay', label: 'Google Pay', type: PaymentMethodTypes.GOOGLE_PAY },
  { value: 'paypal', label: 'PayPal', type: PaymentMethodTypes.PAYPAL },
  { value: 'crypto', label: 'Crypto', type: PaymentMethodTypes.CRYPTO },
  { value: 'bnpl', label: 'Buy now, pay later', type: PaymentMethodTypes.BNPL },
];

export const DELIVERY_METHODS: { value: TDeliveryMethod; label: string; type: DeliveryMethod }[] = [
  { value: 'standard', label: 'Standard (5-7 days)', type: DeliveryMethods.STANDARD },
  { value: 'express', label: 'Express (1-2 days)', type: DeliveryMethods.EXPRESS },
  { value: 'same_day', label: 'Same day', type: DeliveryMethods.SAME_DAY },
  { value: 'pickup', label: 'Store pickup', type: DeliveryMethods.PICKUP },
];

export const CRYPTO_ASSETS = ['BTC', 'ETH', 'USDC'];

const WALLET_PROVIDERS: Partial<Record<TPaymentMethod, string>> = {
  apple_pay: 'apple',
  google_pay: 'google',
  paypal: 'paypal',
  crypto: 'coinbase',
  bnpl: 'klarna',
};

export const DEFAULT_SEGMENT: Readonly<ISegment> = Object.freeze({
  tier: 'standard',
  country: 'US',
  paymentMethod: 'card',
  cardNetwork: 'visa',
  deliveryMethod: 'standard',
});

export const cardNetwork = (cardNumber: string): string => {
  const digits = cardNumber.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('4')) return 'visa';
  if (/^3[47]/.test(digits)) return 'amex';
  if (/^(6011|65)/.test(digits)) return 'discover';
  // Mastercard: 51-55 or 2221-2720
  if (/^5[1-5]/.test(digits) || /^(222[1-9]|22[3-9]\d|2[3-6]\d\d|27[01]\d|2720)/.test(digits)) return 'mastercard';
  return 'unknown';
};

export const regionOf = (country: string) => COUNTRIES.find(({ code }) => code === country)?.region || 'other';

export const walletProvider = (method: TPaymentMethod) => WALLET_PROVIDERS[method] || '';

export const carrier = (deliveryMethod: TDeliveryMethod, country: string): string => {
  if (deliveryMethod === 'same_day' || deliveryMethod === 'pickup') return 'local_courier';
  if (deliveryMethod === 'express') return ['US', 'CA'].includes(country) ? 'fedex' : 'dhl';
  if (country === 'US') return 'usps';
  if (country === 'CA') return 'ups';
  return ['BR', 'JP', 'IN'].includes(country) ? 'fedex' : 'dhl';
};

export const paymentMethodType = (method: TPaymentMethod) =>
  PAYMENT_METHODS.find(({ value }) => value === method)?.type ?? PaymentMethodTypes.CARD;

export const deliveryMethodType = (method: TDeliveryMethod) =>
  DELIVERY_METHODS.find(({ value }) => value === method)?.type ?? DeliveryMethods.STANDARD;

export const segmentBaggage = (
  userId: string,
  segment: ISegment,
  platform: TPlatform = 'web'
): Record<string, string> => {
  const entries: Record<string, string> = {
    'user.id': userId,
    'demo.user_context.tier': segment.tier,
    'demo.user_context.country': segment.country,
    'demo.user_context.region': regionOf(segment.country),
    'demo.client.platform': platform,
    'demo.payment.method': segment.paymentMethod,
    'demo.payment.card_type': segment.paymentMethod === 'card' ? segment.cardNetwork : '',
    'demo.payment.wallet_provider': walletProvider(segment.paymentMethod),
    'demo.shipping.delivery_method': segment.deliveryMethod,
    'demo.shipping.carrier': carrier(segment.deliveryMethod, segment.country),
  };
  return Object.fromEntries(Object.entries(entries).filter(([, value]) => value !== ''));
};
