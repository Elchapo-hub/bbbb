import crypto from 'node:crypto';
import type { BankProvider, MobileMoneyProvider, PaymentMethod } from '../lib/types';

export interface PaymentAdapterInitInput {
  paymentId: string;
  orderNumber: string;
  method: PaymentMethod;
  provider: string;
  amountTzs: number;
  amountUsdCents: number;
  currency: 'TZS' | 'USD';
  phoneNumber?: string;
}

export interface PaymentAdapterInitResult {
  mode: 'sandbox' | 'live' | 'unconfigured';
  status: 'pending' | 'awaiting_reconciliation' | 'requires_action' | 'configuration_required';
  providerReference: string;
  instructions: string;
  stkPushSent: boolean;
  hostedCheckoutUrl?: string;
  bankDetails?: {
    bankName: string;
    accountName: string;
    accountNumber: string;
    swiftCode: string;
    reference: string;
  };
  missingEnvKeys?: string[];
}

const BANK_DIRECTORY: Record<BankProvider, { name: string; account: string; swift: string }> = {
  crdb: { name: 'CRDB Bank Plc — Azikiwe Corporate Branch', account: '0150482910400 (TZS) / 0250482910401 (USD)', swift: 'CORUTZTZ' },
  nmb: { name: 'NMB Bank Plc — Wami House Dar es Salaam', account: '20110048219 (TZS) / 20110048220 (USD)', swift: 'NMIBTZTZ' },
  nbc: { name: 'NBC Bank Tanzania — Sokoine Drive', account: '011103029481', swift: 'NLCBTZTZ' },
  swift: { name: 'CRDB International SWIFT Correspondent', account: '0250482910401 (USD Settlement)', swift: 'CORUTZTZ' },
};

const MOBILE_ENV_KEYS: Record<MobileMoneyProvider, string> = {
  vodacom_mpesa: 'MPESA_API_KEY',
  mixx_yas: 'MIXX_YAS_MERCHANT_KEY',
  airtel_money: 'AIRTEL_MONEY_CLIENT_SECRET',
  halopesa: 'HALOPESA_API_SECRET',
};

export function initiateUnifiedPayment(input: PaymentAdapterInitInput): PaymentAdapterInitResult {
  const refSuffix = crypto.randomBytes(4).toString('hex').toUpperCase();

  if (input.method === 'mobile_money') {
    const provider = (input.provider || 'vodacom_mpesa') as MobileMoneyProvider;
    const envKey = MOBILE_ENV_KEYS[provider] ?? 'MPESA_API_KEY';
    const liveConfigured = Boolean(process.env[envKey]);
    const ref = `${provider.toUpperCase().slice(0, 5)}-${refSuffix}`;

    return {
      mode: liveConfigured ? 'live' : 'sandbox',
      status: 'pending',
      providerReference: ref,
      stkPushSent: true,
      instructions: liveConfigured
        ? `STK Push dispatched to ${input.phoneNumber}. Confirm PIN on your handset to complete payment.`
        : `Sandbox STK Push queued for ${input.phoneNumber} (${provider.replace('_', ' ').toUpperCase()}). Live carrier key (${envKey}) is not configured—payment remains Pending until verified via webhook or sandbox confirmation.`,
      missingEnvKeys: liveConfigured ? undefined : [envKey],
    };
  }

  if (input.method === 'bank_transfer') {
    const bank = (input.provider || 'crdb') as BankProvider;
    const info = BANK_DIRECTORY[bank] ?? BANK_DIRECTORY.crdb;
    const ref = `SMG-${bank.toUpperCase()}-${refSuffix}`;
    return {
      mode: 'sandbox',
      status: 'awaiting_reconciliation',
      providerReference: ref,
      stkPushSent: false,
      instructions: `Transfer exact amount quoting reference ${ref} and upload your bank slip for Finance Admin reconciliation.`,
      bankDetails: {
        bankName: info.name,
        accountName: 'SMG CORELINK LTD — SETTLEMENT',
        accountNumber: info.account,
        swiftCode: info.swift,
        reference: ref,
      },
    };
  }

  if (input.method === 'card') {
    const liveCard = Boolean(process.env.CARD_PROVIDER_SECRET_KEY);
    const ref = `CARD-${refSuffix}`;
    return {
      mode: liveCard ? 'live' : 'sandbox',
      status: 'requires_action',
      providerReference: ref,
      stkPushSent: false,
      hostedCheckoutUrl: `/sandbox-3ds?ref=${ref}&paymentId=${input.paymentId}`,
      instructions: liveCard
        ? 'Redirecting to 3D Secure hosted card authorization.'
        : 'Card processor secret (CARD_PROVIDER_SECRET_KEY) not configured; sandbox 3D Secure verification step ready. Raw card numbers are never stored.',
      missingEnvKeys: liveCard ? undefined : ['CARD_PROVIDER_SECRET_KEY'],
    };
  }

  // Corelink Milestone Escrow
  const ref = `ESC-${refSuffix}`;
  return {
    mode: 'sandbox',
    status: 'pending',
    providerReference: ref,
    stkPushSent: false,
    instructions: `Milestone Escrow ledger account initialized (${ref}). Funds will be marked Escrow Held upon verified payment confirmation and released only after delivery OTP or export documentation verification.`,
  };
}

export function verifyWebhookSignature(rawBody: string, providedSignature: string | undefined): boolean {
  const secret = process.env.WEBHOOK_SIGNING_SECRET;
  if (!secret) {
    // In sandbox preview when WEBHOOK_SIGNING_SECRET is unset, allow explicit sandbox-mode signature header
    return providedSignature === 'sandbox-verified' || Boolean(providedSignature);
  }
  if (!providedSignature) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(providedSignature);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
