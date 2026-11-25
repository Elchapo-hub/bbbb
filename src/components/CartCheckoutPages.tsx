import React, { useEffect, useState } from 'react';
import { CheckCircle2, Clock, Lock, ShieldCheck, Trash2 } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { apiRequest } from '../lib/api';
import { computeEffectiveRateScaled, convertCurrencyMinor, formatMoney } from '../lib/finance';
import type { CheckoutQuote, CorridorCode, PaymentMethod } from '../lib/types';

export function CartPage() {
  const { cartItems, updateCartQuantity, removeCartItem, navigate, fx, displayCurrency } = useStore();
  const fxScaled = computeEffectiveRateScaled(fx?.midRate ?? 2680, fx?.spreadBps ?? 120);

  const subtotalTzs = cartItems.reduce(
    (s, i) => s + convertCurrencyMinor(i.product.basePriceMinor, i.product.baseCurrency, 'TZS', fxScaled) * i.quantity,
    0
  );
  const subtotalUsd = cartItems.reduce(
    (s, i) => s + convertCurrencyMinor(i.product.basePriceMinor, i.product.baseCurrency, 'USD', fxScaled) * i.quantity,
    0
  );

  return (
    <main className="max-w-[1440px] mx-auto px-4 sm:px-8 py-10 space-y-8">
      <div className="border-b border-white/10 pb-5">
        <h1 className="font-display text-3xl font-bold text-white">Shopping Cart</h1>
        <p className="text-sm text-[#94A3B8] mt-1">
          Adjust quantities to unlock wholesale B2B tiers, then proceed to lock your 15-minute checkout FX rate.
        </p>
      </div>

      {cartItems.length === 0 ? (
        <div className="p-12 text-center bg-[#0B1426] border border-white/10 rounded-xl space-y-4">
          <p className="text-lg font-semibold text-white">Your shopping cart is empty</p>
          <button
            type="button"
            onClick={() => navigate('shop')}
            className="px-6 py-2.5 rounded-md bg-[#F5B82E] text-[#050B18] text-sm font-semibold cursor-pointer"
          >
            Browse Catalogue
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-8 space-y-4">
            {cartItems.map((item) => {
              const unitTzs = convertCurrencyMinor(item.product.basePriceMinor, item.product.baseCurrency, 'TZS', fxScaled);
              const unitUsd = convertCurrencyMinor(item.product.basePriceMinor, item.product.baseCurrency, 'USD', fxScaled);
              return (
                <div
                  key={item.id}
                  className="p-4 sm:p-5 rounded-xl bg-[#0B1426] border border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-4">
                    <img
                      src={item.product.images[0]}
                      alt={item.product.name}
                      className="w-20 h-16 rounded-lg object-cover border border-white/10 shrink-0"
                    />
                    <div>
                      <button
                        type="button"
                        onClick={() => navigate('product', item.productId)}
                        className="font-semibold text-white hover:text-[#F5B82E] text-left cursor-pointer"
                      >
                        {item.product.name}
                      </button>
                      <p className="text-xs text-[#94A3B8]">
                        {item.variantName ? `${item.variantName} · ` : ''}{item.product.merchantName}
                      </p>
                      <p className="font-mono text-xs text-[#F5B82E] tabular-nums mt-1">
                        {formatMoney(unitTzs, 'TZS')} · {formatMoney(unitUsd, 'USD')} each
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 self-end sm:self-center">
                    <div className="inline-flex items-center border border-white/15 rounded-md bg-[#050B18]">
                      <button
                        type="button"
                        onClick={() => item.quantity > 1 && void updateCartQuantity(item.id, item.quantity - 1)}
                        className="w-9 h-9 text-white hover:text-[#F5B82E] cursor-pointer"
                        aria-label={`Decrease quantity for ${item.product.name}`}
                      >
                        −
                      </button>
                      <span className="w-10 text-center font-mono text-sm tabular-nums">{item.quantity}</span>
                      <button
                        type="button"
                        onClick={() => void updateCartQuantity(item.id, item.quantity + 1)}
                        className="w-9 h-9 text-white hover:text-[#F5B82E] cursor-pointer"
                        aria-label={`Increase quantity for ${item.product.name}`}
                      >
                        +
                      </button>
                    </div>

                    <div className="text-right min-w-[120px]">
                      <p className="font-mono text-sm font-semibold text-white tabular-nums">
                        {displayCurrency === 'TZS'
                          ? formatMoney(unitTzs * item.quantity, 'TZS')
                          : formatMoney(unitUsd * item.quantity, 'USD')}
                      </p>
                      <p className="font-mono text-xs text-[#94A3B8] tabular-nums">
                        {displayCurrency === 'TZS'
                          ? formatMoney(unitUsd * item.quantity, 'USD')
                          : formatMoney(unitTzs * item.quantity, 'TZS')}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => void removeCartItem(item.id)}
                      aria-label={`Remove ${item.product.name} from cart`}
                      className="p-2 text-[#94A3B8] hover:text-red-400 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="lg:col-span-4 bg-[#0B1426] border border-white/10 rounded-xl p-6 space-y-5">
            <h2 className="font-display text-xl font-semibold text-white">Estimated Cart Summary</h2>
            <div className="space-y-2 text-sm border-b border-white/10 pb-4">
              <div className="flex justify-between">
                <span className="text-[#94A3B8]">Gross Subtotal (TZS)</span>
                <span className="font-mono text-white tabular-nums">{formatMoney(subtotalTzs, 'TZS')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#94A3B8]">Gross Subtotal (USD)</span>
                <span className="font-mono text-white tabular-nums">{formatMoney(subtotalUsd, 'USD')}</span>
              </div>
            </div>
            <p className="text-xs text-[#94A3B8]">
              Wholesale discounts, coupon codes (e.g. <span className="font-mono text-white">CORELINK10</span>), logistics corridor fees, insurance, and VAT are calculated authoritatively on the server at checkout.
            </p>
            <button
              type="button"
              onClick={() => navigate('checkout')}
              className="w-full h-11 rounded-md bg-[#F5B82E] hover:bg-[#D4931D] text-[#050B18] text-sm font-semibold cursor-pointer"
            >
              Proceed to Checkout
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

export function CheckoutPage() {
  const {
    user,
    corridors,
    cartItems,
    navigate,
    showToast,
    refreshCart,
    setLastOrderResult,
  } = useStore();

  const [corridorCode, setCorridorCode] = useState<CorridorCode>('LOG-01');
  const [destinationZone, setDestinationZone] = useState('Kinondoni');
  const [freightMode, setFreightMode] = useState<'air' | 'sea_lcl' | 'sea_fcl'>('air');
  const [couponCode, setCouponCode] = useState('');
  const [buyerTaxProfile, setBuyerTaxProfile] = useState<'retail_b2c' | 'business_b2b' | 'vat_exempt' | 'export_buyer'>(
    user?.taxProfile ?? 'retail_b2c'
  );
  const [hasExportDocs, setHasExportDocs] = useState(false);
  const [hasExemptionDocs, setHasExemptionDocs] = useState(false);

  const [recipientName, setRecipientName] = useState(user?.fullName ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [country, setCountry] = useState('Tanzania');
  const [regionOrCity, setRegionOrCity] = useState('Dar es Salaam');
  const [district, setDistrict] = useState('Kinondoni');
  const [streetAddress, setStreetAddress] = useState('');

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('mobile_money');
  const [provider, setProvider] = useState('vodacom_mpesa');
  const [mobilePhone, setMobilePhone] = useState(user?.phone ?? '+255754310920');
  const [payCurrency, setPayCurrency] = useState<'TZS' | 'USD'>('TZS');

  const [quote, setQuote] = useState<CheckoutQuote | null>(null);
  const [couponMessage, setCouponMessage] = useState<string | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [lockSecondsLeft, setLockSecondsLeft] = useState<number>(900);

  const selectedCorridor = corridors.find((c) => c.code === corridorCode) ?? corridors[0];

  useEffect(() => {
    if (selectedCorridor && !selectedCorridor.coverageZones.includes(destinationZone)) {
      setDestinationZone(selectedCorridor.coverageZones[0]);
    }
    if (selectedCorridor?.isExport) {
      setCountry(selectedCorridor.coverageZones[0]);
      setRegionOrCity(selectedCorridor.coverageZones[0]);
    } else {
      setCountry('Tanzania');
    }
  }, [corridorCode, selectedCorridor, destinationZone]);

  useEffect(() => {
    if (paymentMethod === 'mobile_money') setProvider('vodacom_mpesa');
    else if (paymentMethod === 'bank_transfer') setProvider('crdb');
    else if (paymentMethod === 'card') setProvider('visa_mastercard');
    else setProvider('corelink_escrow');
  }, [paymentMethod]);

  const fetchQuote = async () => {
    if (cartItems.length === 0) return;
    setLoadingQuote(true);
    try {
      const res = await apiRequest<{ quote: CheckoutQuote; couponMessage: string | null }>('/ecommerce/cart/quote', {
        method: 'POST',
        body: JSON.stringify({
          corridorCode,
          destinationZone,
          freightMode,
          couponCode,
          buyerTaxProfile,
          paymentIsElectronicB2C: paymentMethod === 'mobile_money' || paymentMethod === 'card',
          hasExportDocs,
          hasExemptionDocs,
        }),
      });
      setQuote(res.quote);
      setCouponMessage(res.couponMessage);
      const secs = Math.max(0, Math.floor((Date.parse(res.quote.fxLockedUntil) - Date.now()) / 1000));
      setLockSecondsLeft(secs);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Quote calculation failed', 'error');
    } finally {
      setLoadingQuote(false);
    }
  };

  useEffect(() => {
    void fetchQuote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [corridorCode, destinationZone, freightMode, buyerTaxProfile, hasExportDocs, hasExemptionDocs, paymentMethod, cartItems.length]);

  useEffect(() => {
    const t = setInterval(() => {
      setLockSecondsLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      showToast('Please sign in or register to place your order', 'info');
      navigate('auth');
      return;
    }
    setSubmitting(true);
    try {
      const orderRes = await apiRequest<{
        orderId: string;
        orderNumber: string;
        invoiceNumber: string;
        trackingReference: string;
        deliveryOtpForCustomer: string;
      }>('/ecommerce/checkout/initiate', {
        method: 'POST',
        body: JSON.stringify({
          corridorCode,
          destinationZone,
          freightMode,
          couponCode: couponCode.trim() || undefined,
          buyerTaxProfile,
          paymentIsElectronicB2C: paymentMethod === 'mobile_money' || paymentMethod === 'card',
          hasExportDocs,
          hasExemptionDocs,
          idempotencyKey: `ord-${user.id}-${Date.now()}`,
          address: {
            recipientName,
            phone,
            country,
            regionOrCity,
            district,
            streetAddress,
          },
        }),
      });

      const payRes = await apiRequest<{
        payment: { id: string; provider_reference: string; instructions: string };
        adapter: {
          bankDetails?: {
            bankName: string;
            accountName: string;
            accountNumber: string;
            swiftCode: string;
            reference: string;
          };
        };
      }>('/ecommerce/payments/initiate', {
        method: 'POST',
        body: JSON.stringify({
          orderId: orderRes.orderId,
          paymentMethod,
          provider,
          currency: payCurrency,
          phoneNumber: paymentMethod === 'mobile_money' ? mobilePhone : undefined,
          idempotencyKey: `pay-${orderRes.orderId}`,
        }),
      });

      setLastOrderResult({
        ...orderRes,
        paymentId: payRes.payment.id,
        paymentMethod,
        provider,
        providerReference: payRes.payment.provider_reference,
        instructions: payRes.payment.instructions,
        bankDetails: payRes.adapter.bankDetails,
      });

      await refreshCart();
      showToast(`Order ${orderRes.orderNumber} initiated`, 'success');
      navigate('payment-confirmation');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Checkout failed', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (cartItems.length === 0) {
    return (
      <main className="max-w-[1440px] mx-auto px-4 sm:px-8 py-14 text-center space-y-4">
        <p className="text-lg font-semibold text-white">Your cart is empty</p>
        <button
          type="button"
          onClick={() => navigate('shop')}
          className="px-5 py-2.5 rounded-md bg-[#F5B82E] text-[#050B18] text-sm font-semibold"
        >
          Shop Products
        </button>
      </main>
    );
  }

  const mm = String(Math.floor(lockSecondsLeft / 60)).padStart(2, '0');
  const ss = String(lockSecondsLeft % 60).padStart(2, '0');

  return (
    <main className="max-w-[1440px] mx-auto px-4 sm:px-8 py-10 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <h1 className="font-display text-3xl font-bold text-white">Checkout & Order Quote</h1>
          <p className="text-sm text-[#94A3B8] mt-1">
            Server-calculated dual-currency breakdown, logistics corridor selection, and escrow-backed payment.
          </p>
        </div>

        {quote && (
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[#0B1426] border border-[#F5B82E]/40 text-xs font-mono text-[#F5B82E] tabular-nums">
            <Clock className="w-4 h-4" />
            <span>FX Locked 1 USD = {quote.lockedFxEffectiveRate} TZS · {mm}:{ss}</span>
          </div>
        )}
      </div>

      {!user && (
        <div className="p-4 rounded-xl bg-[#0B1426] border border-[#F5B82E]/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <p className="text-sm text-white">
            Sign in or create a customer account to finalize checkout and receive your Delivery OTP & Invoice.
          </p>
          <button
            type="button"
            onClick={() => navigate('auth')}
            className="px-4 py-2 rounded-md bg-[#F5B82E] text-[#050B18] text-xs font-semibold whitespace-nowrap cursor-pointer"
          >
            Sign In / Register
          </button>
        </div>
      )}

      <form onSubmit={handleCheckoutSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-7 space-y-6">
          {/* Step A: Shipping Corridor & Destination */}
          <section className="bg-[#0B1426] border border-white/10 rounded-xl p-6 space-y-4">
            <h2 className="font-display text-xl font-semibold text-white">1. Logistics Corridor & Destination</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {corridors.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCorridorCode(c.code)}
                  className={`p-3.5 rounded-lg border text-left transition-colors cursor-pointer ${
                    corridorCode === c.code
                      ? 'border-[#F5B82E] bg-[#F5B82E]/10'
                      : 'border-white/10 bg-[#050B18] hover:border-white/30'
                  }`}
                >
                  <p className="font-mono text-xs text-[#F5B82E]">{c.code} · {c.incoterm}</p>
                  <p className="text-sm font-semibold text-white mt-0.5">{c.name}</p>
                  <p className="text-xs text-[#94A3B8] mt-1">{c.estimatedDelivery}</p>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div>
                <label htmlFor="dest-zone" className="block text-xs text-[#94A3B8] mb-1">Destination Zone / Country</label>
                <select
                  id="dest-zone"
                  value={destinationZone}
                  onChange={(e) => setDestinationZone(e.target.value)}
                  className="w-full h-10 px-3 rounded-md bg-[#050B18] border border-white/15 text-sm text-white"
                >
                  {(selectedCorridor?.coverageZones ?? []).map((z) => (
                    <option key={z} value={z}>{z}</option>
                  ))}
                </select>
              </div>

              {corridorCode === 'LOG-04' && (
                <div>
                  <label htmlFor="freight-mode" className="block text-xs text-[#94A3B8] mb-1">Export Freight Mode</label>
                  <select
                    id="freight-mode"
                    value={freightMode}
                    onChange={(e) => setFreightMode(e.target.value as typeof freightMode)}
                    className="w-full h-10 px-3 rounded-md bg-[#050B18] border border-white/15 text-sm text-white"
                  >
                    <option value="air">Global Air Freight ($6.50/kg)</option>
                    <option value="sea_lcl">Sea Freight LCL (per CBM)</option>
                    <option value="sea_fcl">Sea Freight 20ft FCL</option>
                  </select>
                </div>
              )}
            </div>
          </section>

          {/* Step B: Delivery Address */}
          <section className="bg-[#0B1426] border border-white/10 rounded-xl p-6 space-y-4">
            <h2 className="font-display text-xl font-semibold text-white">2. Delivery & Consignee Address</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="chk-name" className="block text-xs text-[#94A3B8] mb-1">Recipient Full Name</label>
                <input
                  id="chk-name"
                  required
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  placeholder="Amina Hassan"
                  className="w-full h-10 px-3 rounded-md bg-[#050B18] border border-white/15 text-sm text-white"
                />
              </div>
              <div>
                <label htmlFor="chk-phone" className="block text-xs text-[#94A3B8] mb-1">Phone Number</label>
                <input
                  id="chk-phone"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+255 754 310 920"
                  className="w-full h-10 px-3 rounded-md bg-[#050B18] border border-white/15 text-sm text-white"
                />
              </div>
              <div>
                <label htmlFor="chk-city" className="block text-xs text-[#94A3B8] mb-1">City / Region</label>
                <input
                  id="chk-city"
                  required
                  value={regionOrCity}
                  onChange={(e) => setRegionOrCity(e.target.value)}
                  className="w-full h-10 px-3 rounded-md bg-[#050B18] border border-white/15 text-sm text-white"
                />
              </div>
              <div>
                <label htmlFor="chk-district" className="block text-xs text-[#94A3B8] mb-1">District / Area</label>
                <input
                  id="chk-district"
                  required
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  className="w-full h-10 px-3 rounded-md bg-[#050B18] border border-white/15 text-sm text-white"
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="chk-street" className="block text-xs text-[#94A3B8] mb-1">Street / Plot / Godown Address</label>
                <input
                  id="chk-street"
                  required
                  value={streetAddress}
                  onChange={(e) => setStreetAddress(e.target.value)}
                  placeholder="Plot 42, Haile Selassie Road, Masaki"
                  className="w-full h-10 px-3 rounded-md bg-[#050B18] border border-white/15 text-sm text-white"
                />
              </div>
            </div>
          </section>

          {/* Step C: Tax Profile & Coupon */}
          <section className="bg-[#0B1426] border border-white/10 rounded-xl p-6 space-y-4">
            <h2 className="font-display text-xl font-semibold text-white">3. Tax Classification & Coupon</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="tax-prof" className="block text-xs text-[#94A3B8] mb-1">Buyer Tax Profile</label>
                <select
                  id="tax-prof"
                  value={buyerTaxProfile}
                  onChange={(e) => setBuyerTaxProfile(e.target.value as typeof buyerTaxProfile)}
                  className="w-full h-10 px-3 rounded-md bg-[#050B18] border border-white/15 text-sm text-white"
                >
                  <option value="retail_b2c">Domestic Retail B2C</option>
                  <option value="business_b2b">Registered Business B2B</option>
                  <option value="export_buyer">International Export Buyer</option>
                  <option value="vat_exempt">VAT Exempt Entity</option>
                </select>
              </div>
              <div>
                <label htmlFor="cpn-input" className="block text-xs text-[#94A3B8] mb-1">Coupon Code (e.g. CORELINK10)</label>
                <div className="flex gap-2">
                  <input
                    id="cpn-input"
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                    placeholder="CORELINK10"
                    className="flex-1 h-10 px-3 rounded-md bg-[#050B18] border border-white/15 text-sm font-mono text-white"
                  />
                  <button
                    type="button"
                    onClick={() => void fetchQuote()}
                    className="px-4 h-10 rounded-md border border-[#F5B82E] text-[#F5B82E] text-xs font-semibold cursor-pointer"
                  >
                    Apply
                  </button>
                </div>
              </div>
            </div>

            {couponMessage && <p className="text-xs text-amber-400">{couponMessage}</p>}

            <div className="flex flex-wrap gap-5 text-xs text-[#94A3B8]">
              {selectedCorridor?.isExport && (
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasExportDocs}
                    onChange={(e) => setHasExportDocs(e.target.checked)}
                    className="accent-[#F5B82E]"
                  />
                  <span>Verified Export Documentation & Airway/Bill of Lading available (0% export VAT check)</span>
                </label>
              )}
              {buyerTaxProfile === 'vat_exempt' && (
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasExemptionDocs}
                    onChange={(e) => setHasExemptionDocs(e.target.checked)}
                    className="accent-[#F5B82E]"
                  />
                  <span>TRA VAT Exemption Certificate attached</span>
                </label>
              )}
            </div>
          </section>

          {/* Step D: Unified Payment Method */}
          <section className="bg-[#0B1426] border border-white/10 rounded-xl p-6 space-y-4">
            <h2 className="font-display text-xl font-semibold text-white">4. Payment Method</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {[
                { id: 'mobile_money' as const, label: 'Mobile Money' },
                { id: 'bank_transfer' as const, label: 'Bank Transfer' },
                { id: 'card' as const, label: 'Debit / Credit Card' },
                { id: 'escrow' as const, label: 'Milestone Escrow' },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setPaymentMethod(m.id)}
                  className={`p-3 rounded-md border text-xs font-semibold cursor-pointer ${
                    paymentMethod === m.id
                      ? 'border-[#F5B82E] bg-[#F5B82E] text-[#050B18]'
                      : 'border-white/15 bg-[#050B18] text-white hover:border-white/30'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {paymentMethod === 'mobile_money' && (
                <>
                  <div>
                    <label htmlFor="mm-prov" className="block text-xs text-[#94A3B8] mb-1">Mobile Network</label>
                    <select
                      id="mm-prov"
                      value={provider}
                      onChange={(e) => setProvider(e.target.value)}
                      className="w-full h-10 px-3 rounded-md bg-[#050B18] border border-white/15 text-sm text-white"
                    >
                      <option value="vodacom_mpesa">Vodacom M-Pesa</option>
                      <option value="mixx_yas">Mixx by Yas</option>
                      <option value="airtel_money">Airtel Money</option>
                      <option value="halopesa">HaloPesa</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="mm-phone" className="block text-xs text-[#94A3B8] mb-1">STK Push Phone Number</label>
                    <input
                      id="mm-phone"
                      required
                      value={mobilePhone}
                      onChange={(e) => setMobilePhone(e.target.value)}
                      placeholder="+255754310920"
                      className="w-full h-10 px-3 rounded-md bg-[#050B18] border border-white/15 text-sm text-white"
                    />
                  </div>
                </>
              )}

              {paymentMethod === 'bank_transfer' && (
                <div>
                  <label htmlFor="bank-prov" className="block text-xs text-[#94A3B8] mb-1">Settlement Bank</label>
                  <select
                    id="bank-prov"
                    value={provider}
                    onChange={(e) => setProvider(e.target.value)}
                    className="w-full h-10 px-3 rounded-md bg-[#050B18] border border-white/15 text-sm text-white"
                  >
                    <option value="crdb">CRDB Bank Plc</option>
                    <option value="nmb">NMB Bank Plc</option>
                    <option value="nbc">NBC Bank Tanzania</option>
                    <option value="swift">International SWIFT Transfer</option>
                  </select>
                </div>
              )}

              {paymentMethod === 'card' && (
                <div className="sm:col-span-2 text-xs text-[#94A3B8] p-3 rounded-md bg-[#050B18] border border-white/10">
                  <Lock className="w-3.5 h-3.5 inline mr-1.5 text-[#10B981]" />
                  Visa, Mastercard & Amex processed via provider-hosted 3D Secure checkout. Raw card numbers are never stored on SMG Corelink servers.
                </div>
              )}

              <div>
                <label htmlFor="pay-curr" className="block text-xs text-[#94A3B8] mb-1">Settlement Currency</label>
                <select
                  id="pay-curr"
                  value={payCurrency}
                  onChange={(e) => setPayCurrency(e.target.value as 'TZS' | 'USD')}
                  className="w-full h-10 px-3 rounded-md bg-[#050B18] border border-white/15 text-sm text-white"
                >
                  <option value="TZS">TZS (Tanzanian Shilling)</option>
                  <option value="USD">USD (US Dollar)</option>
                </select>
              </div>
            </div>
          </section>
        </div>

        {/* Right: Server-Calculated Financial Breakdown */}
        <aside className="lg:col-span-5 lg:sticky lg:top-24 bg-[#0B1426] border border-white/10 rounded-xl p-6 space-y-5">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <h2 className="font-display text-xl font-semibold text-white">Order Financial Breakdown</h2>
            {loadingQuote && <span className="text-xs text-[#F5B82E]">Recalculating...</span>}
          </div>

          {quote ? (
            <div className="space-y-3 text-xs">
              <div className="space-y-2 border-b border-white/10 pb-3">
                {quote.lines.map((l) => (
                  <div key={`${l.productId}-${l.variantId}`} className="flex justify-between gap-3">
                    <span className="text-white">
                      {l.quantity}× {l.name}
                      {l.discountReason && <span className="block text-[#10B981]">{l.discountReason}</span>}
                    </span>
                    <span className="font-mono text-white tabular-nums shrink-0">{formatMoney(l.netSubtotalTzs, 'TZS')}</span>
                  </div>
                ))}
              </div>

              <div className="flex justify-between text-[#94A3B8]">
                <span>Original Product Subtotal</span>
                <span className="font-mono tabular-nums">{formatMoney(quote.grossSubtotalTzs, 'TZS')} / {formatMoney(quote.grossSubtotalUsdCents, 'USD')}</span>
              </div>
              <div className="flex justify-between text-[#10B981]">
                <span>Product & Wholesale Discounts</span>
                <span className="font-mono tabular-nums">-{formatMoney(quote.productDiscountTzs, 'TZS')}</span>
              </div>
              <div className="flex justify-between text-[#10B981]">
                <span>Coupon Discount {quote.couponCode ? `(${quote.couponCode})` : ''}</span>
                <span className="font-mono tabular-nums">-{formatMoney(quote.couponDiscountTzs, 'TZS')}</span>
              </div>
              <div className="flex justify-between text-[#94A3B8]">
                <span>Chargeable Weight (Actual {quote.totalActualWeightKg}kg / Vol {quote.totalVolumetricWeightKg}kg)</span>
                <span className="font-mono tabular-nums">{quote.chargeableWeightKg} kg</span>
              </div>
              <div className="flex justify-between text-[#94A3B8]">
                <span>Shipping ({quote.corridorCode} · {quote.incoterm} · {quote.destinationZone})</span>
                <span className="font-mono tabular-nums">{formatMoney(quote.shippingFeeTzs, 'TZS')}</span>
              </div>
              <div className="flex justify-between text-[#94A3B8]">
                <span>Cargo Insurance</span>
                <span className="font-mono tabular-nums">{formatMoney(quote.insuranceFeeTzs, 'TZS')}</span>
              </div>
              <div className="flex justify-between text-[#94A3B8]">
                <span>VAT ({quote.appliedTaxRuleCode} · {(quote.appliedTaxRateBps / 100).toFixed(1)}%)</span>
                <span className="font-mono tabular-nums">{formatMoney(quote.vatTzs, 'TZS')}</span>
              </div>

              <div className="pt-3 border-t border-white/15 space-y-1">
                <div className="flex justify-between items-baseline">
                  <span className="text-sm font-semibold text-white">Final Total (TZS)</span>
                  <span className="font-mono text-lg font-bold text-[#F5B82E] tabular-nums">{formatMoney(quote.finalTotalTzs, 'TZS')}</span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-sm font-semibold text-white">Final Total (USD)</span>
                  <span className="font-mono text-base font-semibold text-white tabular-nums">{formatMoney(quote.finalTotalUsdCents, 'USD')}</span>
                </div>
              </div>

              <p className="text-[11px] text-[#94A3B8] pt-2 leading-relaxed">{quote.customsNote}</p>
            </div>
          ) : (
            <p className="text-sm text-[#94A3B8]">Calculating server quote...</p>
          )}

          <button
            type="submit"
            disabled={submitting || !quote}
            className="w-full h-11 rounded-md bg-[#F5B82E] hover:bg-[#D4931D] disabled:opacity-40 text-[#050B18] text-sm font-semibold cursor-pointer"
          >
            {submitting ? 'Creating Order & Payment...' : 'Confirm Order & Initiate Payment'}
          </button>
        </aside>
      </form>
    </main>
  );
}

export function PaymentConfirmationPage() {
  const { lastOrderResult, navigate, showToast } = useStore();
  const [proofRef, setProofRef] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<string>('pending');
  const [busy, setBusy] = useState(false);

  if (!lastOrderResult) {
    return (
      <main className="max-w-[1440px] mx-auto px-4 sm:px-8 py-14 text-center space-y-4">
        <p className="text-white text-lg font-semibold">No recent checkout session</p>
        <button
          type="button"
          onClick={() => navigate('orders')}
          className="px-5 py-2.5 rounded-md bg-[#F5B82E] text-[#050B18] text-sm font-semibold"
        >
          View Order History
        </button>
      </main>
    );
  }

  const handleProofSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lastOrderResult.paymentId) return;
    setBusy(true);
    try {
      await apiRequest(`/ecommerce/payments/${lastOrderResult.paymentId}/proof`, {
        method: 'POST',
        body: JSON.stringify({ proofUrl: proofRef }),
      });
      setPaymentStatus('awaiting_reconciliation');
      showToast('Bank transfer proof submitted for Finance Admin reconciliation', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to upload proof', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleSandboxWebhookConfirm = async () => {
    if (!lastOrderResult.paymentId) return;
    setBusy(true);
    try {
      await apiRequest('/ecommerce/payments/webhook', {
        method: 'POST',
        headers: { 'x-corelink-signature': 'sandbox-verified' },
        body: JSON.stringify({
          paymentId: lastOrderResult.paymentId,
          status: 'confirmed',
          providerReference: lastOrderResult.providerReference || `SBX-${Date.now()}`,
        }),
      });
      setPaymentStatus('confirmed');
      showToast('Sandbox webhook verified! Order is now Escrow Funded.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Webhook failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-8 py-12 space-y-6">
      <div className="bg-[#0B1426] border border-white/10 rounded-xl p-8 space-y-6">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-5">
          <div>
            <p className="font-mono text-xs text-[#F5B82E]">Order Initiated · {lastOrderResult.orderNumber}</p>
            <h1 className="font-display text-3xl font-bold text-white mt-1">
              {paymentStatus === 'confirmed' ? 'Payment Verified & Escrow Funded' : 'Complete Payment Authorization'}
            </h1>
          </div>
          {paymentStatus === 'confirmed' && <CheckCircle2 className="w-8 h-8 text-[#10B981] shrink-0" />}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs bg-[#050B18] border border-white/10 rounded-lg p-4">
          <div>
            <p className="text-[#94A3B8]">Payment Reference</p>
            <p className="font-mono text-white font-semibold mt-1">{lastOrderResult.providerReference}</p>
          </div>
          <div>
            <p className="text-[#94A3B8]">Tracking Reference</p>
            <p className="font-mono text-white font-semibold mt-1">{lastOrderResult.trackingReference}</p>
          </div>
          <div>
            <p className="text-[#94A3B8]">Customer Delivery OTP</p>
            <p className="font-mono text-[#F5B82E] font-bold mt-1">{lastOrderResult.deliveryOtpForCustomer || 'Saved in Orders'}</p>
          </div>
        </div>

        <p className="text-sm text-[#94A3B8] leading-relaxed">{lastOrderResult.instructions}</p>

        {lastOrderResult.bankDetails && paymentStatus !== 'confirmed' && (
          <div className="p-4 rounded-lg bg-[#050B18] border border-white/10 space-y-2 text-xs">
            <p className="font-semibold text-white">Bank Settlement Instructions</p>
            <p className="text-[#94A3B8]">Bank: <span className="text-white">{lastOrderResult.bankDetails.bankName}</span></p>
            <p className="text-[#94A3B8]">Account Name: <span className="text-white">{lastOrderResult.bankDetails.accountName}</span></p>
            <p className="text-[#94A3B8]">Account No: <span className="font-mono text-white">{lastOrderResult.bankDetails.accountNumber}</span></p>
            <p className="text-[#94A3B8]">SWIFT: <span className="font-mono text-white">{lastOrderResult.bankDetails.swiftCode}</span></p>
            <form onSubmit={handleProofSubmit} className="flex flex-col sm:flex-row gap-2 pt-3">
              <input
                required
                value={proofRef}
                onChange={(e) => setProofRef(e.target.value)}
                placeholder="Enter bank slip ref or receipt filename (e.g. CRDB-SLIP-4012.pdf)"
                className="flex-1 h-10 px-3 rounded-md bg-[#0B1426] border border-white/15 text-xs text-white"
              />
              <button
                type="submit"
                disabled={busy}
                className="px-4 h-10 rounded-md bg-[#F5B82E] text-[#050B18] text-xs font-semibold cursor-pointer"
              >
                Submit Proof
              </button>
            </form>
          </div>
        )}

        {paymentStatus !== 'confirmed' && lastOrderResult.paymentMethod !== 'bank_transfer' && (
          <div className="p-4 rounded-lg bg-[#050B18] border border-[#F5B82E]/30 space-y-3">
            <p className="text-xs text-[#94A3B8]">
              <ShieldCheck className="w-4 h-4 inline mr-1.5 text-[#F5B82E]" />
              External carrier/processor credentials are in sandbox mode. Real payments only confirm upon a verified provider webhook response:
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleSandboxWebhookConfirm()}
              className="px-4 py-2 rounded-md border border-[#10B981] text-[#10B981] hover:bg-[#10B981] hover:text-[#050B18] text-xs font-semibold transition-colors cursor-pointer"
            >
              Trigger Sandbox Provider Webhook Confirmation
            </button>
          </div>
        )}

        <div className="flex flex-wrap gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate('tracking', lastOrderResult.orderNumber)}
            className="px-5 py-2.5 rounded-md bg-[#F5B82E] text-[#050B18] text-xs font-semibold cursor-pointer"
          >
            Track Order {lastOrderResult.orderNumber}
          </button>
          <button
            type="button"
            onClick={() => navigate('orders')}
            className="px-5 py-2.5 rounded-md border border-white/15 text-white text-xs font-semibold cursor-pointer"
          >
            View Order History & Invoice
          </button>
        </div>
      </div>
    </main>
  );
}
