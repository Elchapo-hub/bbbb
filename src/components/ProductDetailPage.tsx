import React, { useEffect, useState } from 'react';
import { ArrowLeft, GitCompareArrows, Heart, ShieldCheck, Star, Truck } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { apiRequest } from '../lib/api';
import { computeEffectiveRateScaled, convertCurrencyMinor, formatMoney, getBestWholesaleTier } from '../lib/finance';
import type { Product } from '../lib/types';

interface ReviewItem {
  id: string;
  author_name: string;
  rating: number;
  comment: string;
  created_at: string;
}

export function ProductDetailPage({ productId }: { productId: string }) {
  const {
    navigate,
    products,
    fx,
    displayCurrency,
    addToCart,
    toggleWishlist,
    toggleCompare,
    wishlistIds,
    compareIds,
    user,
    showToast,
  } = useStore();

  const localMatch = products.find((p) => p.id === productId || p.slug === productId) ?? null;
  const [product, setProduct] = useState<Product | null>(localMatch);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    localMatch?.variants[0]?.id ?? null
  );
  const [qty, setQty] = useState(1);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  useEffect(() => {
    let active = true;
    apiRequest<{ product: Product; reviews: ReviewItem[] }>(`/ecommerce/products/${productId}`)
      .then((res) => {
        if (!active) return;
        setProduct(res.product);
        setReviews(res.reviews);
        setSelectedVariantId(res.product.variants[0]?.id ?? null);
      })
      .catch(() => {
        // Fallback to localMatch if already loaded
      });
    return () => {
      active = false;
    };
  }, [productId]);

  if (!product) {
    return (
      <main className="max-w-[1440px] mx-auto px-4 sm:px-8 py-16 text-center space-y-4">
        <p className="text-lg font-semibold text-white">Product not found</p>
        <button
          type="button"
          onClick={() => navigate('shop')}
          className="px-5 py-2.5 rounded-md bg-[#F5B82E] text-[#050B18] text-sm font-semibold"
        >
          Return to Shop
        </button>
      </main>
    );
  }

  const selectedVariant = product.variants.find((v) => v.id === selectedVariantId) ?? null;
  const unitBaseMinor = Math.max(0, product.basePriceMinor + (selectedVariant?.priceDeltaMinor ?? 0));
  const fxScaled = computeEffectiveRateScaled(fx?.midRate ?? 2680, fx?.spreadBps ?? 120);
  const tzsUnit = convertCurrencyMinor(unitBaseMinor, product.baseCurrency, 'TZS', fxScaled);
  const usdUnit = convertCurrencyMinor(unitBaseMinor, product.baseCurrency, 'USD', fxScaled);

  const activeTier = getBestWholesaleTier(product.wholesaleTiers, qty);
  const effectiveMultiplier = activeTier ? 1 - activeTier.discountPercent / 100 : 1;
  const discountedTzsUnit = Math.round(tzsUnit * effectiveMultiplier);
  const discountedUsdUnit = Math.round(usdUnit * effectiveMultiplier);

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      showToast('Please sign in to submit a verified review', 'info');
      navigate('auth');
      return;
    }
    setSubmittingReview(true);
    try {
      await apiRequest(`/ecommerce/products/${product.id}/reviews`, {
        method: 'POST',
        body: JSON.stringify({ rating, comment }),
      });
      setReviews((prev) => [
        { id: `rev-${Date.now()}`, author_name: user.fullName, rating, comment, created_at: new Date().toISOString() },
        ...prev,
      ]);
      setComment('');
      showToast('Review published', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to post review', 'error');
    } finally {
      setSubmittingReview(false);
    }
  };

  return (
    <main className="max-w-[1440px] mx-auto px-4 sm:px-8 py-10 space-y-14">
      <button
        type="button"
        onClick={() => navigate('shop')}
        className="inline-flex items-center gap-2 text-sm text-[#94A3B8] hover:text-white cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Marketplace</span>
      </button>

      {/* Contiguous Product Gallery + Purchase Module */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
        <div className="lg:col-span-7 lg:sticky lg:top-24 space-y-4">
          <div className="aspect-[4/3] rounded-xl overflow-hidden bg-[#0B1426] border border-white/10">
            <img
              src={product.images[0]}
              alt={product.name}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="grid grid-cols-3 gap-4 text-xs text-[#94A3B8] bg-[#0B1426] border border-white/10 rounded-xl p-4">
            <div>
              <p className="text-white font-medium">SKU</p>
              <p className="font-mono mt-0.5">{selectedVariant?.sku || product.sku}</p>
            </div>
            <div>
              <p className="text-white font-medium">Parcel Weight</p>
              <p className="font-mono tabular-nums mt-0.5">{product.weightKg} kg</p>
            </div>
            <div>
              <p className="text-white font-medium">Box Dimensions</p>
              <p className="font-mono tabular-nums mt-0.5">
                {product.lengthCm} × {product.widthCm} × {product.heightCm} cm
              </p>
            </div>
          </div>
        </div>

        {/* Sticky Purchase Module */}
        <div className="lg:col-span-5 bg-[#0B1426] border border-white/10 rounded-xl p-6 sm:p-8 space-y-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-[#94A3B8]">
              <span>{product.categoryCode} · {product.categoryName}</span>
              <span aria-hidden="true">·</span>
              <span>{product.subtype}</span>
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">{product.name}</h1>
            <div className="flex items-center gap-2 text-xs text-[#94A3B8]">
              <span>Sold by <strong className="text-white">{product.merchantName}</strong></span>
              {product.merchantVerified && (
                <span className="inline-flex items-center gap-1 text-[#10B981] font-medium">
                  <ShieldCheck className="w-4 h-4" />
                  Verified Merchant
                </span>
              )}
            </div>
          </div>

          {/* Dual Currency Pricing */}
          <div className="p-4 rounded-lg bg-[#050B18] border border-white/10 space-y-1">
            <div className="flex items-baseline justify-between gap-4">
              <span className="font-mono text-2xl font-bold text-[#F5B82E] tabular-nums">
                {displayCurrency === 'TZS'
                  ? formatMoney(discountedTzsUnit, 'TZS')
                  : formatMoney(discountedUsdUnit, 'USD')}
              </span>
              <span className="font-mono text-sm text-[#94A3B8] tabular-nums">
                {displayCurrency === 'TZS'
                  ? formatMoney(discountedUsdUnit, 'USD')
                  : formatMoney(discountedTzsUnit, 'TZS')}
              </span>
            </div>
            {activeTier && (
              <p className="text-xs text-[#10B981]">
                Wholesale tier active: {activeTier.discountPercent}% off for {activeTier.minQty}+ units
              </p>
            )}
            <p className="text-xs text-[#94A3B8]">
              Base price set in {product.baseCurrency} · Updated {new Date(product.lastFxUpdateAt).toLocaleTimeString()}
            </p>
          </div>

          <p className="text-sm text-[#94A3B8] leading-relaxed">{product.description}</p>

          {/* Variant Selector */}
          {product.variants.length > 0 && (
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-white">Select Option / Variant</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {product.variants.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setSelectedVariantId(v.id)}
                    className={`px-3 py-2.5 rounded-md text-left text-xs border transition-colors cursor-pointer ${
                      selectedVariantId === v.id
                        ? 'border-[#F5B82E] bg-[#F5B82E]/10 text-white'
                        : 'border-white/10 bg-[#050B18] text-[#94A3B8] hover:border-white/30'
                    }`}
                  >
                    <p className="font-medium text-white">{v.name}</p>
                    <p className="text-[11px] text-[#94A3B8]">{v.stockQty} available</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quantity & Wholesale Tiers */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label htmlFor="pdp-qty" className="text-xs font-semibold text-white">
                Quantity ({product.stockQty} in stock)
              </label>
              <div className="inline-flex items-center border border-white/15 rounded-md bg-[#050B18]">
                <button
                  type="button"
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  className="w-10 h-10 text-white hover:text-[#F5B82E] cursor-pointer"
                  aria-label="Decrease quantity"
                >
                  −
                </button>
                <input
                  id="pdp-qty"
                  type="number"
                  min={1}
                  max={product.stockQty}
                  value={qty}
                  onChange={(e) => setQty(Math.max(1, Math.min(product.stockQty || 1, Number(e.target.value) || 1)))}
                  className="w-14 text-center bg-transparent text-sm font-mono text-white focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setQty((q) => Math.min(product.stockQty || 1, q + 1))}
                  className="w-10 h-10 text-white hover:text-[#F5B82E] cursor-pointer"
                  aria-label="Increase quantity"
                >
                  +
                </button>
              </div>
            </div>

            {product.wholesaleTiers.length > 0 && (
              <div className="p-3 rounded-lg bg-[#050B18] border border-white/10">
                <p className="text-xs font-semibold text-white mb-2">Wholesale B2B Volume Discounts</p>
                <div className="flex flex-wrap gap-3 text-xs">
                  {product.wholesaleTiers.map((t) => (
                    <button
                      key={t.minQty}
                      type="button"
                      onClick={() => setQty(t.minQty)}
                      className={`px-2.5 py-1 rounded border cursor-pointer ${
                        qty >= t.minQty
                          ? 'border-[#10B981] text-[#10B981]'
                          : 'border-white/15 text-[#94A3B8] hover:text-white'
                      }`}
                    >
                      {t.minQty}+ units: {t.discountPercent}% off
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              disabled={product.stockQty <= 0}
              onClick={() => void addToCart(product.id, qty, selectedVariantId)}
              className="flex-1 h-11 rounded-md bg-[#F5B82E] hover:bg-[#D4931D] disabled:opacity-40 text-[#050B18] text-sm font-semibold cursor-pointer"
            >
              Add {qty} to Cart
            </button>
            <button
              type="button"
              onClick={() => void toggleWishlist(product.id)}
              aria-label="Toggle wishlist"
              className={`h-11 px-4 rounded-md border inline-flex items-center justify-center gap-2 text-xs font-semibold cursor-pointer ${
                wishlistIds.includes(product.id)
                  ? 'border-[#F5B82E] text-[#F5B82E]'
                  : 'border-white/15 text-white hover:border-[#F5B82E]'
              }`}
            >
              <Heart className="w-4 h-4" />
              <span>Save</span>
            </button>
            <button
              type="button"
              onClick={() => toggleCompare(product.id)}
              aria-label="Toggle comparison"
              className={`h-11 px-4 rounded-md border inline-flex items-center justify-center gap-2 text-xs font-semibold cursor-pointer ${
                compareIds.includes(product.id)
                  ? 'border-[#10B981] text-[#10B981]'
                  : 'border-white/15 text-white hover:border-[#F5B82E]'
              }`}
            >
              <GitCompareArrows className="w-4 h-4" />
              <span>Compare</span>
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs text-[#94A3B8] pt-2 border-t border-white/10">
            <Truck className="w-4 h-4 text-[#F5B82E] shrink-0" />
            <span>Eligible for Dar Express DDP (2–6h), Upcountry TZ, EAC/SADC, and Global Air & Sea Export.</span>
          </div>
        </div>
      </div>

      {/* Category Attributes & Reviews */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-6 bg-[#0B1426] border border-white/10 rounded-xl p-6">
          <h2 className="font-display text-xl font-semibold text-white mb-4">Technical & Category Specifications</h2>
          <dl className="divide-y divide-white/10 text-sm">
            {Object.entries(product.attributes).map(([key, val]) => (
              <div key={key} className="py-2.5 flex items-center justify-between gap-4">
                <dt className="text-[#94A3B8] capitalize">{key.replace(/([A-Z])/g, ' $1')}</dt>
                <dd className="text-white font-medium text-right">{String(val)}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="lg:col-span-6 bg-[#0B1426] border border-white/10 rounded-xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold text-white">Verified Buyer Reviews</h2>
            <span className="inline-flex items-center gap-1 text-sm font-mono text-[#F5B82E]">
              <Star className="w-4 h-4 fill-current" />
              {product.ratingAvg} ({reviews.length})
            </span>
          </div>

          <form onSubmit={handleReviewSubmit} className="space-y-3 pb-4 border-b border-white/10">
            <div className="flex items-center gap-3">
              <label htmlFor="rev-rating" className="text-xs text-[#94A3B8]">Rating:</label>
              <select
                id="rev-rating"
                value={rating}
                onChange={(e) => setRating(Number(e.target.value))}
                className="px-2.5 py-1.5 rounded bg-[#050B18] border border-white/15 text-xs text-white"
              >
                {[5, 4, 3, 2, 1].map((r) => (
                  <option key={r} value={r}>{r} Stars</option>
                ))}
              </select>
            </div>
            <textarea
              rows={2}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Share product quality, sizing, or logistics experience..."
              className="w-full p-3 rounded-md bg-[#050B18] border border-white/15 text-sm text-white placeholder:text-[#94A3B8]"
              required
            />
            <button
              type="submit"
              disabled={submittingReview}
              className="px-4 py-2 rounded-md bg-[#F5B82E] text-[#050B18] text-xs font-semibold cursor-pointer"
            >
              {submittingReview ? 'Submitting...' : 'Submit Review'}
            </button>
          </form>

          <div className="space-y-4">
            {reviews.length === 0 ? (
              <p className="text-sm text-[#94A3B8]">No buyer reviews yet.</p>
            ) : (
              reviews.map((r) => (
                <div key={r.id} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-white">{r.author_name}</span>
                    <span className="font-mono text-[#F5B82E]">{'★'.repeat(r.rating)}</span>
                  </div>
                  <p className="text-sm text-[#94A3B8]">{r.comment}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
