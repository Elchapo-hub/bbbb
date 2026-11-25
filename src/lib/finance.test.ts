import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCheckoutQuote,
  computeEffectiveRateScaled,
  tzsToUsdCents,
  usdCentsToTzs,
} from './finance';
import type { CouponRecord, ShippingCorridor, TaxRule } from './types';

const CORRIDORS: ShippingCorridor[] = [
  {
    id: 'log-01',
    code: 'LOG-01',
    name: 'Dar Express',
    incoterm: 'DDP',
    coverageZones: ['Kinondoni', 'Ilala', 'Temeke', 'Ubungo', 'Kigamboni'],
    baseCurrency: 'TZS',
    baseRateMinor: 5000,
    includedWeightKg: 5,
    perKgRateMinor: 800,
    insuranceRateBps: 0,
    estimatedDelivery: 'Same day, 2–6 hours',
    isExport: false,
    active: true,
  },
  {
    id: 'log-03',
    code: 'LOG-03',
    name: 'EAC & SADC',
    incoterm: 'DAP',
    coverageZones: ['Kenya', 'Uganda', 'Rwanda'],
    baseCurrency: 'USD',
    baseRateMinor: 3500,
    includedWeightKg: 5,
    perKgRateMinor: 180,
    insuranceRateBps: 50,
    estimatedDelivery: '2–5 business days',
    isExport: true,
    active: true,
  },
];

const TAX_RULES: TaxRule[] = [
  {
    id: 't1',
    code: 'TAX-TZ-STD',
    name: 'Standard VAT 18%',
    rateBps: 1800,
    appliesToLogistics: true,
    requiresExportDocs: false,
    requiresExemptionDocs: false,
    description: '18% standard',
    active: true,
  },
  {
    id: 't2',
    code: 'TAX-TZ-DIG',
    name: 'Digital B2C VAT 16%',
    rateBps: 1600,
    appliesToLogistics: true,
    requiresExportDocs: false,
    requiresExemptionDocs: false,
    description: '16% electronic B2C',
    active: true,
  },
  {
    id: 't3',
    code: 'TAX-EXP-00',
    name: 'Verified Export 0%',
    rateBps: 0,
    appliesToLogistics: false,
    requiresExportDocs: true,
    requiresExemptionDocs: false,
    description: '0% verified export',
    active: true,
  },
  {
    id: 't4',
    code: 'TAX-EXEMPT',
    name: 'Exempt 0%',
    rateBps: 0,
    appliesToLogistics: false,
    requiresExportDocs: false,
    requiresExemptionDocs: true,
    description: '0% exempt',
    active: true,
  },
];

test('FX conversion round-trip consistency using BigInt math', () => {
  const scaled = computeEffectiveRateScaled(2680, 0);
  assert.equal(usdCentsToTzs(10000, scaled), 268000);
  assert.equal(tzsToUsdCents(268000, scaled), 10000);
});

test('6-step checkout calculation with wholesale discount, coupon, Dar Express, and 18% VAT', () => {
  const coupon: CouponRecord = {
    id: 'c1',
    code: 'CORELINK10',
    type: 'percentage',
    value: 10,
    currency: 'USD',
    minPurchaseMinor: 5000,
    maxDiscountMinor: 50000,
    usageLimit: 100,
    usedCount: 0,
    eligibleSegment: 'all',
    expiresAt: null,
    active: true,
  };

  const quote = calculateCheckoutQuote({
    items: [
      {
        productId: 'p1',
        name: 'Executive Suit',
        sku: 'SUIT-01',
        quantity: 5, // triggers 10% wholesale tier
        basePriceMinor: 20000, // $200.00
        baseCurrency: 'USD',
        weightKg: 1.5, // 7.5kg total (> 5kg base -> +2.5kg)
        lengthCm: 40,
        widthCm: 30,
        heightCm: 8,
        wholesaleTiers: [
          { minQty: 5, discountPercent: 10 },
          { minQty: 15, discountPercent: 15 },
        ],
        promotion: null,
      },
    ],
    corridor: CORRIDORS[0],
    destinationZone: 'Kinondoni',
    coupon,
    taxRules: TAX_RULES,
    buyerTaxProfile: 'business_b2b',
    paymentIsElectronicB2C: false,
    hasExportDocs: false,
    hasExemptionDocs: false,
    fxMidRate: 2680,
    fxSpreadBps: 0,
  });

  // Step 1: Gross = 5 * $200 = $1,000 (100000 cents)
  assert.equal(quote.grossSubtotalUsdCents, 100000);
  // Step 2: Wholesale 10% = $100 -> Net = $900
  assert.equal(quote.productDiscountUsdCents, 10000);
  assert.equal(quote.netProductSubtotalUsdCents, 90000);
  // Step 3: Coupon 10% of $900 = $90 -> Taxable goods = $810
  assert.equal(quote.couponDiscountUsdCents, 9000);
  assert.equal(quote.taxableGoodsBaseUsdCents, 81000);
  // Step 4: Weight = 5 * max(1.5, 40*30*8/5000=1.92) = 9.6kg -> rounded 10kg -> 5kg base (5000 TZS) + 5kg * 800 = 9000 TZS
  assert.equal(quote.chargeableWeightKg, 10);
  assert.equal(quote.shippingFeeTzs, 9000);
  // Step 5 & 6: Exact equation invariance
  assert.equal(quote.appliedTaxRuleCode, 'TAX-TZ-STD');
  assert.equal(
    quote.finalTotalTzs,
    quote.taxableGoodsBaseTzs + quote.logisticsTotalTzs + quote.vatTzs
  );
  assert.equal(
    quote.finalTotalUsdCents,
    quote.taxableGoodsBaseUsdCents + quote.logisticsTotalUsdCents + quote.vatUsdCents
  );
});

test('Export corridor does NOT zero-rate without verified export docs', () => {
  const withoutDocs = calculateCheckoutQuote({
    items: [
      {
        productId: 'p2',
        name: 'Chronograph Watch',
        sku: 'WATCH-01',
        quantity: 1,
        basePriceMinor: 50000,
        baseCurrency: 'USD',
        weightKg: 0.8,
        lengthCm: 20,
        widthCm: 15,
        heightCm: 10,
        wholesaleTiers: [],
        promotion: null,
      },
    ],
    corridor: CORRIDORS[1],
    destinationZone: 'Kenya',
    coupon: null,
    taxRules: TAX_RULES,
    buyerTaxProfile: 'export_buyer',
    paymentIsElectronicB2C: false,
    hasExportDocs: false,
    hasExemptionDocs: false,
    fxMidRate: 2680,
    fxSpreadBps: 100,
  });

  assert.equal(withoutDocs.appliedTaxRuleCode, 'TAX-TZ-STD');
  assert.ok(withoutDocs.vatTzs > 0);

  const withDocs = calculateCheckoutQuote({
    items: [
      {
        productId: 'p2',
        name: 'Chronograph Watch',
        sku: 'WATCH-01',
        quantity: 1,
        basePriceMinor: 50000,
        baseCurrency: 'USD',
        weightKg: 0.8,
        lengthCm: 20,
        widthCm: 15,
        heightCm: 10,
        wholesaleTiers: [],
        promotion: null,
      },
    ],
    corridor: CORRIDORS[1],
    destinationZone: 'Kenya',
    coupon: null,
    taxRules: TAX_RULES,
    buyerTaxProfile: 'export_buyer',
    paymentIsElectronicB2C: false,
    hasExportDocs: true,
    hasExemptionDocs: false,
    fxMidRate: 2680,
    fxSpreadBps: 100,
  });

  assert.equal(withDocs.appliedTaxRuleCode, 'TAX-EXP-00');
  assert.equal(withDocs.vatTzs, 0);
  assert.equal(withDocs.vatUsdCents, 0);
});

test('10,000 simulated randomized cart calculations maintain decimal-safe accounting invariants', () => {
  // Deterministic LCG PRNG for reproducible 10,000 simulation run
  let seed = 421987;
  const nextRand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  for (let i = 0; i < 10_000; i++) {
    const qty = 1 + Math.floor(nextRand() * 40);
    const isUsd = nextRand() > 0.5;
    const basePriceMinor = isUsd
      ? 500 + Math.floor(nextRand() * 250_000)
      : 10_000 + Math.floor(nextRand() * 5_000_000);
    const corridor = CORRIDORS[Math.floor(nextRand() * CORRIDORS.length)];
    const fxMid = 2400 + Math.floor(nextRand() * 600);
    const spreadBps = Math.floor(nextRand() * 250);

    const quote = calculateCheckoutQuote({
      items: [
        {
          productId: `sim-${i}`,
          name: 'Sim Product',
          sku: `SIM-${i}`,
          quantity: qty,
          basePriceMinor,
          baseCurrency: isUsd ? 'USD' : 'TZS',
          weightKg: 0.2 + nextRand() * 8,
          lengthCm: 10 + Math.floor(nextRand() * 50),
          widthCm: 10 + Math.floor(nextRand() * 40),
          heightCm: 5 + Math.floor(nextRand() * 30),
          wholesaleTiers: [
            { minQty: 5, discountPercent: 10 },
            { minQty: 15, discountPercent: 15 },
            { minQty: 30, discountPercent: 20 },
          ],
          promotion: nextRand() > 0.5 ? { type: 'percentage', value: 8, active: true } : null,
        },
      ],
      corridor,
      destinationZone: corridor.coverageZones[0],
      coupon: nextRand() > 0.5
        ? {
            id: 'sim-c',
            code: 'SIM10',
            type: 'percentage',
            value: 10,
            currency: 'USD',
            minPurchaseMinor: 1000,
            maxDiscountMinor: 25000,
            usageLimit: null,
            usedCount: 0,
            eligibleSegment: 'all',
            expiresAt: null,
            active: true,
          }
        : null,
      taxRules: TAX_RULES,
      buyerTaxProfile: nextRand() > 0.5 ? 'retail_b2c' : 'business_b2b',
      paymentIsElectronicB2C: nextRand() > 0.5,
      hasExportDocs: corridor.isExport && nextRand() > 0.5,
      hasExemptionDocs: false,
      fxMidRate: fxMid,
      fxSpreadBps: spreadBps,
    });

    // Accounting conservation checks in both currencies
    assert.equal(quote.netProductSubtotalTzs, quote.grossSubtotalTzs - quote.productDiscountTzs);
    assert.equal(quote.taxableGoodsBaseTzs, quote.netProductSubtotalTzs - quote.couponDiscountTzs);
    assert.equal(quote.logisticsTotalTzs, quote.shippingFeeTzs + quote.insuranceFeeTzs);
    assert.equal(quote.finalTotalTzs, quote.taxableGoodsBaseTzs + quote.logisticsTotalTzs + quote.vatTzs);

    assert.equal(quote.netProductSubtotalUsdCents, quote.grossSubtotalUsdCents - quote.productDiscountUsdCents);
    assert.equal(quote.taxableGoodsBaseUsdCents, quote.netProductSubtotalUsdCents - quote.couponDiscountUsdCents);
    assert.equal(quote.logisticsTotalUsdCents, quote.shippingFeeUsdCents + quote.insuranceFeeUsdCents);
    assert.equal(quote.finalTotalUsdCents, quote.taxableGoodsBaseUsdCents + quote.logisticsTotalUsdCents + quote.vatUsdCents);

    assert.ok(quote.finalTotalTzs >= 0);
    assert.ok(quote.finalTotalUsdCents >= 0);
  }
});
