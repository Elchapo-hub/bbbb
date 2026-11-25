export type UserRole = 'customer' | 'merchant' | 'admin' | 'operations';

export type CurrencyCode = 'TZS' | 'USD';

export type VerificationStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

export type OrderStatus =
  | 'Pending'
  | 'Awaiting Payment'
  | 'Paid'
  | 'Escrow Funded'
  | 'Processing'
  | 'Packed'
  | 'Inspected'
  | 'Dispatched'
  | 'In Transit'
  | 'Delivered'
  | 'Completed'
  | 'Cancelled'
  | 'Refunded'
  | 'Disputed';

export type EscrowState =
  | 'Awaiting payment'
  | 'Funded'
  | 'Escrow held'
  | 'Packed and inspected'
  | 'In transit'
  | 'Delivered'
  | 'Verified'
  | 'Released'
  | 'Refunded'
  | 'Disputed';

export type PaymentMethod = 'mobile_money' | 'bank_transfer' | 'card' | 'escrow';

export type MobileMoneyProvider = 'vodacom_mpesa' | 'mixx_yas' | 'airtel_money' | 'halopesa';

export type BankProvider = 'crdb' | 'nmb' | 'nbc' | 'swift';

export type CorridorCode = 'LOG-01' | 'LOG-02' | 'LOG-03' | 'LOG-04';

export type TaxRuleCode = 'TAX-TZ-STD' | 'TAX-TZ-DIG' | 'TAX-EXP-00' | 'TAX-EXEMPT';

export interface CategoryAttributeField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'boolean';
  options?: string[];
  required?: boolean;
  unit?: string;
}

export interface CategoryDefinition {
  id: string;
  code: string;
  name: string;
  slug: string;
  description: string;
  subtypes: string[];
  attributeSchema: CategoryAttributeField[];
}

export interface WholesaleTier {
  minQty: number;
  discountPercent: number;
}

export interface ProductVariant {
  id: string;
  sku: string;
  name: string;
  stockQty: number;
  priceDeltaMinor: number;
  attributes: Record<string, string>;
}

export interface ProductPromotion {
  id?: string;
  type: 'percentage' | 'fixed';
  value: number; // percentage (0-100) or minor units in product base currency
  active: boolean;
  startsAt?: string;
  endsAt?: string;
}

export interface Product {
  id: string;
  merchantId: string;
  merchantName: string;
  merchantVerified: boolean;
  categoryId: string;
  categoryCode: string;
  categoryName: string;
  sku: string;
  name: string;
  slug: string;
  subtype: string;
  description: string;
  basePriceMinor: number; // TZS in whole shillings, USD in cents
  baseCurrency: CurrencyCode;
  convertedPriceMinor: number;
  lastFxUpdateAt: string;
  weightKg: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  stockQty: number;
  lowStockThreshold: number;
  isFeatured: boolean;
  isNewArrival: boolean;
  isBestSeller: boolean;
  isActive: boolean;
  images: string[];
  attributes: Record<string, string | number | boolean>;
  variants: ProductVariant[];
  wholesaleTiers: WholesaleTier[];
  promotion: ProductPromotion | null;
  ratingAvg: number;
  reviewCount: number;
  createdAt: string;
}

export interface ExchangeRateRecord {
  id: string;
  baseCurrency: 'USD';
  quoteCurrency: 'TZS';
  midRate: number; // e.g., 2680
  spreadBps: number; // e.g., 150 = 1.50%
  effectiveRate: number; // midRate * (1 + spreadBps/10000)
  source: string; // 'Bank of Tanzania' | 'CRDB Commercial' | 'Manual Admin' | 'Fallback'
  isFallback: boolean;
  updatedAt: string;
}

export interface ShippingCorridor {
  id: string;
  code: CorridorCode;
  name: string;
  incoterm: string;
  coverageZones: string[];
  baseCurrency: CurrencyCode;
  baseRateMinor: number; // First 5kg for LOG-01/02/03, or base fee
  includedWeightKg: number;
  perKgRateMinor: number;
  seaLclPerCbmUsdCents?: number;
  seaFcl20ftUsdCents?: number;
  insuranceRateBps: number; // e.g. 50 = 0.50%
  estimatedDelivery: string;
  isExport: boolean;
  active: boolean;
}

export interface TaxRule {
  id: string;
  code: TaxRuleCode;
  name: string;
  rateBps: number; // 1800 = 18.00%
  appliesToLogistics: boolean;
  requiresExportDocs: boolean;
  requiresExemptionDocs: boolean;
  description: string;
  active: boolean;
}

export interface CouponRecord {
  id: string;
  code: string;
  type: 'percentage' | 'fixed';
  value: number; // percentage (0-100) or USD cents if fixed
  currency: CurrencyCode;
  minPurchaseMinor: number;
  maxDiscountMinor: number | null;
  usageLimit: number | null;
  usedCount: number;
  eligibleSegment: 'all' | 'retail' | 'wholesale';
  expiresAt: string | null;
  active: boolean;
}

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  role: UserRole;
  emailVerified: boolean;
  preferredCurrency: CurrencyCode;
  taxProfile: 'retail_b2c' | 'business_b2b' | 'vat_exempt' | 'export_buyer';
  tinNumber?: string;
  status: 'active' | 'suspended';
  createdAt: string;
}

export interface CustomerAddress {
  id: string;
  userId: string;
  label: string;
  recipientName: string;
  phone: string;
  country: string;
  regionOrCity: string;
  district: string;
  streetAddress: string;
  postalCode?: string;
  isDefault: boolean;
}

export interface QuoteLineInput {
  productId: string;
  variantId?: string | null;
  name: string;
  sku: string;
  quantity: number;
  basePriceMinor: number;
  baseCurrency: CurrencyCode;
  weightKg: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  wholesaleTiers: WholesaleTier[];
  promotion: ProductPromotion | null;
}

export interface QuoteRequestInput {
  items: QuoteLineInput[];
  corridor: ShippingCorridor;
  destinationZone: string;
  freightMode?: 'air' | 'sea_lcl' | 'sea_fcl';
  coupon: CouponRecord | null;
  taxRules: TaxRule[];
  buyerTaxProfile: 'retail_b2c' | 'business_b2b' | 'vat_exempt' | 'export_buyer';
  paymentIsElectronicB2C: boolean;
  hasExportDocs: boolean;
  hasExemptionDocs: boolean;
  fxMidRate: number;
  fxSpreadBps: number;
  nowIso?: string;
}

export interface LineCalculation {
  productId: string;
  variantId?: string | null;
  name: string;
  sku: string;
  quantity: number;
  unitPriceTzs: number;
  unitPriceUsdCents: number;
  grossTotalTzs: number;
  grossTotalUsdCents: number;
  productDiscountTzs: number;
  productDiscountUsdCents: number;
  discountReason: string | null;
  netSubtotalTzs: number;
  netSubtotalUsdCents: number;
  actualWeightKg: number;
  volumetricWeightKg: number;
  chargeableWeightKg: number;
}

export interface CheckoutQuote {
  lines: LineCalculation[];
  grossSubtotalTzs: number;
  grossSubtotalUsdCents: number;
  productDiscountTzs: number;
  productDiscountUsdCents: number;
  netProductSubtotalTzs: number;
  netProductSubtotalUsdCents: number;
  couponCode: string | null;
  couponDiscountTzs: number;
  couponDiscountUsdCents: number;
  taxableGoodsBaseTzs: number;
  taxableGoodsBaseUsdCents: number;
  totalActualWeightKg: number;
  totalVolumetricWeightKg: number;
  chargeableWeightKg: number;
  shippingFeeTzs: number;
  shippingFeeUsdCents: number;
  insuranceFeeTzs: number;
  insuranceFeeUsdCents: number;
  logisticsTotalTzs: number;
  logisticsTotalUsdCents: number;
  appliedTaxRuleCode: TaxRuleCode;
  appliedTaxRateBps: number;
  taxableAmountTzs: number;
  taxableAmountUsdCents: number;
  vatTzs: number;
  vatUsdCents: number;
  finalTotalTzs: number;
  finalTotalUsdCents: number;
  lockedFxMidRate: number;
  lockedFxSpreadBps: number;
  lockedFxEffectiveRate: number;
  fxLockedUntil: string;
  corridorCode: CorridorCode;
  corridorName: string;
  incoterm: string;
  destinationZone: string;
  estimatedDelivery: string;
  customsNote: string;
}
