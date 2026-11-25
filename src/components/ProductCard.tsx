import React, { useState } from 'react';
import { Check, GitCompareArrows, Heart, ShieldCheck, ShoppingBag } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { computeEffectiveRateScaled, convertCurrencyMinor, formatMoney } from '../lib/finance';
import type { Product } from '../lib/types';

export function ProductCard({ product }: { product: Product }) {
  const {
    navigate,
    addToCart,
    toggleWishlist,
    toggleCompare,
    wishlistIds,
    compareIds,
    displayCurrency,
    fx,
  } = useStore();
  const [imgError, setImgError] = useState(false);
  const [adding, setAdding] = useState(false);

  const fxScaled = computeEffectiveRateScaled(fx?.midRate ?? 2680, fx?.spreadBps ?? 120);
  const tzsMinor = convertCurrencyMinor(product.basePriceMinor, product.baseCurrency, 'TZS', fxScaled);
  const usdMinor = convertCurrencyMinor(product.basePriceMinor, product.baseCurrency, 'USD', fxScaled);

  const primaryPrice = displayCurrency === 'TZS' ? formatMoney(tzsMinor, 'TZS') : formatMoney(usdMinor, 'USD');
  const secondaryPrice = displayCurrency === 'TZS' ? formatMoney(usdMinor, 'USD') : formatMoney(tzsMinor, 'TZS');

  const isWishlisted = wishlistIds.includes(product.id);
  const isCompared = compareIds.includes(product.id);
  const promoPct =
    product.promotion && product.promotion.active && product.promotion.type === 'percentage'
      ? product.promotion.value
      : null;

  const handleAdd = async () => {
    setAdding(true);
    await addToCart(product.id, 1, product.variants[0]?.id ?? null);
    setAdding(false);
  };

  return (
    <article className="group bg-[#0B1426] border border-white/10 rounded-xl overflow-hidden flex flex-col transition-transform duration-200 hover:-translate-y-0.5 hover:border-[#F5B82E]/40">
      <div className="relative aspect-[4/3] bg-[#050B18] overflow-hidden">
        {!imgError && product.images[0] ? (
          <img
            src={product.images[0]}
            alt={product.name}
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-6 bg-gradient-to-br from-[#0B1426] to-[#13203B] text-center">
            <ShoppingBag className="w-8 h-8 text-[#F5B82E] mb-2" />
            <span className="text-xs text-[#94A3B8]">{product.name}</span>
          </div>
        )}

        <div className="absolute top-3 right-3 flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => void toggleWishlist(product.id)}
            aria-label={isWishlisted ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`}
            className={`w-9 h-9 rounded-md flex items-center justify-center backdrop-blur-md border transition-colors cursor-pointer ${
              isWishlisted
                ? 'bg-[#F5B82E] text-[#050B18] border-[#F5B82E]'
                : 'bg-[#050B18]/80 text-white border-white/15 hover:border-[#F5B82E]'
            }`}
          >
            <Heart className={`w-4 h-4 ${isWishlisted ? 'fill-current' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => toggleCompare(product.id)}
            aria-label={`Compare ${product.name}`}
            className={`w-9 h-9 rounded-md flex items-center justify-center backdrop-blur-md border transition-colors cursor-pointer ${
              isCompared
                ? 'bg-[#10B981] text-[#050B18] border-[#10B981]'
                : 'bg-[#050B18]/80 text-white border-white/15 hover:border-[#F5B82E]'
            }`}
          >
            {isCompared ? <Check className="w-4 h-4" /> : <GitCompareArrows className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div className="p-5 flex-1 flex flex-col justify-between gap-4">
        <div className="space-y-2">
          {/* Clean unboxed zero-pill metadata with typographic separators */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-[#94A3B8]">
            <span>{product.categoryName}</span>
            <span aria-hidden="true">·</span>
            <span className={product.stockQty > 0 ? 'text-[#10B981]' : 'text-red-400'}>
              {product.stockQty > 0 ? `${product.stockQty} in stock` : 'Out of stock'}
            </span>
            {promoPct !== null && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-[#F5B82E] font-medium">{promoPct}% off</span>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => navigate('product', product.id)}
            className="text-left block w-full focus-visible:outline-none focus-visible:text-[#F5B82E] cursor-pointer"
          >
            <h3 className="text-base font-semibold text-white group-hover:text-[#F5B82E] transition-colors line-clamp-2">
              {product.name}
            </h3>
          </button>

          <div className="flex items-center gap-1.5 text-xs text-[#94A3B8]">
            <span className="truncate">{product.merchantName}</span>
            {product.merchantVerified && (
              <span className="inline-flex items-center gap-1 text-[#10B981] shrink-0 font-medium">
                <ShieldCheck className="w-3.5 h-3.5" />
                Verified
              </span>
            )}
          </div>
        </div>

        <div className="pt-3 border-t border-white/10 flex items-end justify-between gap-3">
          <div>
            <p className="font-mono text-base font-semibold text-white tabular-nums">{primaryPrice}</p>
            <p className="font-mono text-xs text-[#94A3B8] tabular-nums">{secondaryPrice}</p>
          </div>

          <button
            type="button"
            disabled={product.stockQty <= 0 || adding}
            onClick={() => void handleAdd()}
            aria-label={`Add ${product.name} to cart`}
            className="px-4 py-2 min-h-[40px] rounded-md bg-[#F5B82E] hover:bg-[#D4931D] disabled:opacity-40 text-[#050B18] text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer"
          >
            {adding ? 'Adding...' : 'Add to Cart'}
          </button>
        </div>
      </div>
    </article>
  );
}
