import type {
  CheckoutQuote,
  CurrencyCode,
  LineCalculation,
  ProductPromotion,
  QuoteRequestInput,
  TaxRule,
  TaxRuleCode,
  WholesaleTier,
} from './types';

const RATE_SCALE = 1_000_000n;
const BPS_SCALE = 10_000n;

/**
 * Deterministic integer half-up division: roundHalfUp(numerator, denominator)
 * Never uses IEEE-754 floating point arithmetic.
 */
export function roundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) {
    throw new Error('Denominator must be positive');
  }
  const sign = numerator < 0n ? -1n : 1n;
  const absNum = numerator < 0n ? -numerator : numerator;
  const quotient = absNum / denominator;
  const remainder = absNum % denominator;
  const rounded = remainder * 2n >= denominator ? quotient + 1n : quotient;
  return sign * rounded;
}

/**
 * Computes effective FX rate scaled by 1,000,000 (BigInt).
 * effectiveRate = midRate * (1 + spreadBps / 10000)
 */
export function computeEffectiveRateScaled(midRate: number, spreadBps: number): bigint {
  const safeMid = BigInt(Math.round(midRate * 100)); // supports up to 2 decimal digits on midRate cleanly
  const safeSpread = BigInt(Math.round(spreadBps));
  // effectiveRateScaled = (safeMid * (10000 + spreadBps) * 1_000_000) / (100 * 10000)
  return roundHalfUp(safeMid * (BPS_SCALE + safeSpread) * RATE_SCALE, 100n * BPS_SCALE);
}

export function effectiveRateScaledToNumber(scaled: bigint): number {
  const hundredths = roundHalfUp(scaled * 100n, RATE_SCALE);
  return Number(hundredths) / 100;
}

/**
 * Converts USD cents (integer) to TZS whole shillings (integer) using BigInt decimal math.
 */
export function usdCentsToTzs(usdCents: number, effectiveRateScaled: bigint): number {
  const tzs = roundHalfUp(BigInt(usdCents) * effectiveRateScaled, 100n * RATE_SCALE);
  return Number(tzs);
}

/**
 * Converts TZS whole shillings (integer) to USD cents (integer) using BigInt decimal math.
 */
export function tzsToUsdCents(tzs: number, effectiveRateScaled: bigint): number {
  const cents = roundHalfUp(BigInt(tzs) * 100n * RATE_SCALE, effectiveRateScaled);
  return Number(cents);
}

export function convertCurrencyMinor(
  amountMinor: number,
  from: CurrencyCode,
  to: CurrencyCode,
  effectiveRateScaled: bigint
): number {
  if (from === to) return Math.round(amountMinor);
  if (from === 'USD' && to === 'TZS') return usdCentsToTzs(Math.round(amountMinor), effectiveRateScaled);
  return tzsToUsdCents(Math.round(amountMinor), effectiveRateScaled);
}

export function formatMoney(minorAmount: number, currency: CurrencyCode): string {
  if (currency === 'TZS') {
    return `TZS ${Math.round(minorAmount).toLocaleString('en-US')}`;
  }
  const dollars = (Math.round(minorAmount) / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `$${dollars}`;
}

/**
 * Volumetric weight in grams (integer): (L * W * H cm^3) / 5000 kg -> * 1000 g = (L * W * H) / 5
 * Returns weight in integer grams for precision, and helper converts to rounded 2-decimal kg.
 */
export function computeVolumetricGrams(lengthCm: number, widthCm: number, heightCm: number): number {
  const l = BigInt(Math.max(0, Math.round(lengthCm * 10)));
  const w = BigInt(Math.max(0, Math.round(widthCm * 10)));
  const h = BigInt(Math.max(0, Math.round(heightCm * 10)));
  // volume in mm^3 / 1000 = cm^3 * 1000 -> divide by 5000 for grams
  const grams = roundHalfUp(l * w * h, 5000n);
  return Number(grams);
}

export function isPromotionActive(promo: ProductPromotion | null, nowIso?: string): boolean {
  if (!promo || !promo.active) return false;
  const now = nowIso ? Date.parse(nowIso) : Date.now();
  if (promo.startsAt && Date.parse(promo.startsAt) > now) return false;
  if (promo.endsAt && Date.parse(promo.endsAt) < now) return false;
  return true;
}

export function getBestWholesaleTier(tiers: WholesaleTier[], quantity: number): WholesaleTier | null {
  let best: WholesaleTier | null = null;
  for (const tier of tiers) {
    if (quantity >= tier.minQty) {
      if (!best || tier.discountPercent > best.discountPercent) {
        best = tier;
      }
    }
  }
  return best;
}

export function selectApplicableTaxRule(params: {
  taxRules: TaxRule[];
  isExportCorridor: boolean;
  buyerTaxProfile: 'retail_b2c' | 'business_b2b' | 'vat_exempt' | 'export_buyer';
  paymentIsElectronicB2C: boolean;
  hasExportDocs: boolean;
  hasExemptionDocs: boolean;
}): TaxRule {
  const { taxRules, isExportCorridor, buyerTaxProfile, paymentIsElectronicB2C, hasExportDocs, hasExemptionDocs } = params;
  const findRule = (code: TaxRuleCode) => taxRules.find((r) => r.code === code && r.active);

  // Zero-rated export ONLY when destination is an export corridor AND required export evidence is provided
  if (isExportCorridor && hasExportDocs) {
    const exp = findRule('TAX-EXP-00');
    if (exp) return exp;
  }

  // Exempt transaction ONLY when exemption documentation is verified
  if (buyerTaxProfile === 'vat_exempt' && hasExemptionDocs) {
    const exempt = findRule('TAX-EXEMPT');
    if (exempt) return exempt;
  }

  // Electronic B2C 16% rate when eligible and configured active
  if (!isExportCorridor && buyerTaxProfile === 'retail_b2c' && paymentIsElectronicB2C) {
    const dig = findRule('TAX-TZ-DIG');
    if (dig) return dig;
  }

  const std = findRule('TAX-TZ-STD');
  if (std) return std;

  return {
    id: 'tax-fallback',
    code: 'TAX-TZ-STD',
    name: 'Domestic Standard VAT (18%)',
    rateBps: 1800,
    appliesToLogistics: true,
    requiresExportDocs: false,
    requiresExemptionDocs: false,
    description: 'Default 18% VAT fallback',
    active: true,
  };
}

/**
 * Authoritative 6-Step Server-Side Checkout & Order Calculation Engine.
 * All intermediate and final calculations use BigInt half-up decimal arithmetic.
 */
export function calculateCheckoutQuote(input: QuoteRequestInput): CheckoutQuote {
  const effectiveRateScaled = computeEffectiveRateScaled(input.fxMidRate, input.fxSpreadBps);
  const lockedFxEffectiveRate = effectiveRateScaledToNumber(effectiveRateScaled);
  const nowMs = input.nowIso ? Date.parse(input.nowIso) : Date.now();
  const fxLockedUntil = new Date(nowMs + 15 * 60 * 1000).toISOString();

  const lines: LineCalculation[] = [];
  let grossSubtotalTzs = 0;
  let grossSubtotalUsdCents = 0;
  let productDiscountTzs = 0;
  let productDiscountUsdCents = 0;
  let totalActualGrams = 0;
  let totalVolumetricGrams = 0;

  for (const item of input.items) {
    const qty = Math.max(1, Math.floor(item.quantity));
    const unitPriceTzs = convertCurrencyMinor(item.basePriceMinor, item.baseCurrency, 'TZS', effectiveRateScaled);
    const unitPriceUsdCents = convertCurrencyMinor(item.basePriceMinor, item.baseCurrency, 'USD', effectiveRateScaled);

    // STEP 1: Gross item total = Unit price * Quantity
    const lineGrossTzs = unitPriceTzs * qty;
    const lineGrossUsdCents = unitPriceUsdCents * qty;

    // STEP 2: Product discounts (best of active product promotion vs wholesale quantity tier)
    let promoDiscTzs = 0;
    let promoDiscUsdCents = 0;
    let promoLabel: string | null = null;

    if (isPromotionActive(item.promotion, input.nowIso) && item.promotion) {
      if (item.promotion.type === 'percentage') {
        const bps = BigInt(Math.round(item.promotion.value * 100));
        promoDiscTzs = Number(roundHalfUp(BigInt(lineGrossTzs) * bps, BPS_SCALE));
        promoDiscUsdCents = Number(roundHalfUp(BigInt(lineGrossUsdCents) * bps, BPS_SCALE));
        promoLabel = `Promo ${item.promotion.value}%`;
      } else {
        const fixedPerUnitTzs = convertCurrencyMinor(item.promotion.value, item.baseCurrency, 'TZS', effectiveRateScaled);
        const fixedPerUnitUsd = convertCurrencyMinor(item.promotion.value, item.baseCurrency, 'USD', effectiveRateScaled);
        promoDiscTzs = Math.min(lineGrossTzs, fixedPerUnitTzs * qty);
        promoDiscUsdCents = Math.min(lineGrossUsdCents, fixedPerUnitUsd * qty);
        promoLabel = 'Promotional discount';
      }
    }

    const wholesaleTier = getBestWholesaleTier(item.wholesaleTiers, qty);
    let wholesaleDiscTzs = 0;
    let wholesaleDiscUsdCents = 0;
    let wholesaleLabel: string | null = null;
    if (wholesaleTier) {
      const bps = BigInt(Math.round(wholesaleTier.discountPercent * 100));
      wholesaleDiscTzs = Number(roundHalfUp(BigInt(lineGrossTzs) * bps, BPS_SCALE));
      wholesaleDiscUsdCents = Number(roundHalfUp(BigInt(lineGrossUsdCents) * bps, BPS_SCALE));
      wholesaleLabel = `Wholesale ${wholesaleTier.minQty}+ (${wholesaleTier.discountPercent}% off)`;
    }

    const useWholesale = wholesaleDiscUsdCents > promoDiscUsdCents || wholesaleDiscTzs > promoDiscTzs;
    const lineDiscTzs = Math.min(lineGrossTzs, useWholesale ? wholesaleDiscTzs : promoDiscTzs);
    const lineDiscUsdCents = Math.min(lineGrossUsdCents, useWholesale ? wholesaleDiscUsdCents : promoDiscUsdCents);
    const discountReason = lineDiscTzs > 0 ? (useWholesale ? wholesaleLabel : promoLabel) : null;

    const netSubtotalTzs = lineGrossTzs - lineDiscTzs;
    const netSubtotalUsdCents = lineGrossUsdCents - lineDiscUsdCents;

    const itemActualGrams = Math.round(Math.max(0.05, item.weightKg) * 1000) * qty;
    const itemVolumetricGrams = computeVolumetricGrams(item.lengthCm, item.widthCm, item.heightCm) * qty;
    const itemChargeableGrams = Math.max(itemActualGrams, itemVolumetricGrams);

    totalActualGrams += itemActualGrams;
    totalVolumetricGrams += itemVolumetricGrams;

    grossSubtotalTzs += lineGrossTzs;
    grossSubtotalUsdCents += lineGrossUsdCents;
    productDiscountTzs += lineDiscTzs;
    productDiscountUsdCents += lineDiscUsdCents;

    lines.push({
      productId: item.productId,
      variantId: item.variantId ?? null,
      name: item.name,
      sku: item.sku,
      quantity: qty,
      unitPriceTzs,
      unitPriceUsdCents,
      grossTotalTzs: lineGrossTzs,
      grossTotalUsdCents: lineGrossUsdCents,
      productDiscountTzs: lineDiscTzs,
      productDiscountUsdCents: lineDiscUsdCents,
      discountReason,
      netSubtotalTzs,
      netSubtotalUsdCents,
      actualWeightKg: Number((itemActualGrams / 1000).toFixed(2)),
      volumetricWeightKg: Number((itemVolumetricGrams / 1000).toFixed(2)),
      chargeableWeightKg: Number((itemChargeableGrams / 1000).toFixed(2)),
    });
  }

  const netProductSubtotalTzs = grossSubtotalTzs - productDiscountTzs;
  const netProductSubtotalUsdCents = grossSubtotalUsdCents - productDiscountUsdCents;

  // STEP 3: Apply coupon discount
  let couponDiscountTzs = 0;
  let couponDiscountUsdCents = 0;
  let appliedCouponCode: string | null = null;

  if (input.coupon && input.coupon.active && netProductSubtotalTzs > 0) {
    const notExpired = !input.coupon.expiresAt || Date.parse(input.coupon.expiresAt) >= nowMs;
    const underLimit = input.coupon.usageLimit === null || input.coupon.usedCount < input.coupon.usageLimit;
    const minPurchaseTzs = convertCurrencyMinor(input.coupon.minPurchaseMinor, input.coupon.currency, 'TZS', effectiveRateScaled);
    const minPurchaseUsd = convertCurrencyMinor(input.coupon.minPurchaseMinor, input.coupon.currency, 'USD', effectiveRateScaled);
    const meetsMin = netProductSubtotalTzs >= minPurchaseTzs || netProductSubtotalUsdCents >= minPurchaseUsd;

    const totalUnits = lines.reduce((acc, l) => acc + l.quantity, 0);
    const segmentEligible =
      input.coupon.eligibleSegment === 'all' ||
      (input.coupon.eligibleSegment === 'wholesale' && totalUnits >= 5) ||
      (input.coupon.eligibleSegment === 'retail' && totalUnits < 5);

    if (notExpired && underLimit && meetsMin && segmentEligible) {
      appliedCouponCode = input.coupon.code;
      if (input.coupon.type === 'percentage') {
        const bps = BigInt(Math.round(input.coupon.value * 100));
        couponDiscountTzs = Number(roundHalfUp(BigInt(netProductSubtotalTzs) * bps, BPS_SCALE));
        couponDiscountUsdCents = Number(roundHalfUp(BigInt(netProductSubtotalUsdCents) * bps, BPS_SCALE));
      } else {
        couponDiscountTzs = convertCurrencyMinor(input.coupon.value, input.coupon.currency, 'TZS', effectiveRateScaled);
        couponDiscountUsdCents = convertCurrencyMinor(input.coupon.value, input.coupon.currency, 'USD', effectiveRateScaled);
      }

      if (input.coupon.maxDiscountMinor !== null) {
        const maxTzs = convertCurrencyMinor(input.coupon.maxDiscountMinor, input.coupon.currency, 'TZS', effectiveRateScaled);
        const maxUsd = convertCurrencyMinor(input.coupon.maxDiscountMinor, input.coupon.currency, 'USD', effectiveRateScaled);
        couponDiscountTzs = Math.min(couponDiscountTzs, maxTzs);
        couponDiscountUsdCents = Math.min(couponDiscountUsdCents, maxUsd);
      }

      couponDiscountTzs = Math.min(couponDiscountTzs, netProductSubtotalTzs);
      couponDiscountUsdCents = Math.min(couponDiscountUsdCents, netProductSubtotalUsdCents);
    }
  }

  const taxableGoodsBaseTzs = netProductSubtotalTzs - couponDiscountTzs;
  const taxableGoodsBaseUsdCents = netProductSubtotalUsdCents - couponDiscountUsdCents;

  // STEP 4: Calculate logistics
  const chargeableGrams = Math.max(totalActualGrams, totalVolumetricGrams);
  // Chargeable weight rounded up to nearest 0.5kg increment, minimum 0.5kg when items exist
  const chargeableHalfKgUnits = lines.length > 0 ? Math.max(1, Math.ceil(chargeableGrams / 500)) : 0;
  const chargeableWeightKg = Number((chargeableHalfKgUnits * 0.5).toFixed(2));

  let shippingFeeTzs = 0;
  let shippingFeeUsdCents = 0;

  if (lines.length > 0) {
    const corridor = input.corridor;
    if (corridor.code === 'LOG-04' && input.freightMode === 'sea_lcl') {
      const seaFeeUsd = corridor.seaLclPerCbmUsdCents ?? 14500;
      shippingFeeUsdCents = seaFeeUsd;
      shippingFeeTzs = convertCurrencyMinor(seaFeeUsd, 'USD', 'TZS', effectiveRateScaled);
    } else if (corridor.code === 'LOG-04' && input.freightMode === 'sea_fcl') {
      const fclFeeUsd = corridor.seaFcl20ftUsdCents ?? 185000;
      shippingFeeUsdCents = fclFeeUsd;
      shippingFeeTzs = convertCurrencyMinor(fclFeeUsd, 'USD', 'TZS', effectiveRateScaled);
    } else {
      const baseTzs = convertCurrencyMinor(corridor.baseRateMinor, corridor.baseCurrency, 'TZS', effectiveRateScaled);
      const baseUsd = convertCurrencyMinor(corridor.baseRateMinor, corridor.baseCurrency, 'USD', effectiveRateScaled);
      const extraKg = Math.max(0, chargeableWeightKg - corridor.includedWeightKg);
      // Express extraKg in 100ths (integer) to avoid float multiplication
      const extraKgHundredths = BigInt(Math.round(extraKg * 100));
      const perKgTzs = convertCurrencyMinor(corridor.perKgRateMinor, corridor.baseCurrency, 'TZS', effectiveRateScaled);
      const perKgUsd = convertCurrencyMinor(corridor.perKgRateMinor, corridor.baseCurrency, 'USD', effectiveRateScaled);

      const extraFeeTzs = Number(roundHalfUp(extraKgHundredths * BigInt(perKgTzs), 100n));
      const extraFeeUsd = Number(roundHalfUp(extraKgHundredths * BigInt(perKgUsd), 100n));

      shippingFeeTzs = baseTzs + extraFeeTzs;
      shippingFeeUsdCents = baseUsd + extraFeeUsd;
    }
  }

  let insuranceFeeTzs = 0;
  let insuranceFeeUsdCents = 0;
  if (lines.length > 0 && input.corridor.insuranceRateBps > 0) {
    const insBps = BigInt(Math.round(input.corridor.insuranceRateBps));
    insuranceFeeTzs = Number(roundHalfUp(BigInt(taxableGoodsBaseTzs) * insBps, BPS_SCALE));
    insuranceFeeUsdCents = Number(roundHalfUp(BigInt(taxableGoodsBaseUsdCents) * insBps, BPS_SCALE));
  }

  const logisticsTotalTzs = shippingFeeTzs + insuranceFeeTzs;
  const logisticsTotalUsdCents = shippingFeeUsdCents + insuranceFeeUsdCents;

  // STEP 5: Calculate tax
  const taxRule = selectApplicableTaxRule({
    taxRules: input.taxRules,
    isExportCorridor: input.corridor.isExport,
    buyerTaxProfile: input.buyerTaxProfile,
    paymentIsElectronicB2C: input.paymentIsElectronicB2C,
    hasExportDocs: input.hasExportDocs,
    hasExemptionDocs: input.hasExemptionDocs,
  });

  const taxableAmountTzs = taxableGoodsBaseTzs + (taxRule.appliesToLogistics ? logisticsTotalTzs : 0);
  const taxableAmountUsdCents = taxableGoodsBaseUsdCents + (taxRule.appliesToLogistics ? logisticsTotalUsdCents : 0);

  const vatBps = BigInt(taxRule.rateBps);
  const vatTzs = Number(roundHalfUp(BigInt(taxableAmountTzs) * vatBps, BPS_SCALE));
  const vatUsdCents = Number(roundHalfUp(BigInt(taxableAmountUsdCents) * vatBps, BPS_SCALE));

  // STEP 6: Calculate final total
  const finalTotalTzs = taxableGoodsBaseTzs + logisticsTotalTzs + vatTzs;
  const finalTotalUsdCents = taxableGoodsBaseUsdCents + logisticsTotalUsdCents + vatUsdCents;

  const customsNote = input.corridor.isExport
    ? `${input.corridor.incoterm} export terms: Destination import duties, excise, and customs brokerage are externally payable by the consignee unless pre-cleared under confirmed DDP documentation.`
    : `${input.corridor.incoterm} domestic Tanzania delivery: No external cross-border customs duties apply.`;

  return {
    lines,
    grossSubtotalTzs,
    grossSubtotalUsdCents,
    productDiscountTzs,
    productDiscountUsdCents,
    netProductSubtotalTzs,
    netProductSubtotalUsdCents,
    couponCode: appliedCouponCode,
    couponDiscountTzs,
    couponDiscountUsdCents,
    taxableGoodsBaseTzs,
    taxableGoodsBaseUsdCents,
    totalActualWeightKg: Number((totalActualGrams / 1000).toFixed(2)),
    totalVolumetricWeightKg: Number((totalVolumetricGrams / 1000).toFixed(2)),
    chargeableWeightKg,
    shippingFeeTzs,
    shippingFeeUsdCents,
    insuranceFeeTzs,
    insuranceFeeUsdCents,
    logisticsTotalTzs,
    logisticsTotalUsdCents,
    appliedTaxRuleCode: taxRule.code,
    appliedTaxRateBps: taxRule.rateBps,
    taxableAmountTzs,
    taxableAmountUsdCents,
    vatTzs,
    vatUsdCents,
    finalTotalTzs,
    finalTotalUsdCents,
    lockedFxMidRate: input.fxMidRate,
    lockedFxSpreadBps: input.fxSpreadBps,
    lockedFxEffectiveRate,
    fxLockedUntil,
    corridorCode: input.corridor.code,
    corridorName: input.corridor.name,
    incoterm: input.corridor.incoterm,
    destinationZone: input.destinationZone,
    estimatedDelivery: input.corridor.estimatedDelivery,
    customsNote,
  };
}
