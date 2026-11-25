import React from 'react';
import { Trash2 } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { computeEffectiveRateScaled, convertCurrencyMinor, formatMoney } from '../lib/finance';

export function ComparePage() {
  const { products, compareIds, toggleCompare, addToCart, navigate, fx } = useStore();
  const selected = products.filter((p) => compareIds.includes(p.id));
  const fxScaled = computeEffectiveRateScaled(fx?.midRate ?? 2680, fx?.spreadBps ?? 120);

  return (
    <main className="max-w-[1440px] mx-auto px-4 sm:px-8 py-10 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <h1 className="font-display text-3xl font-bold text-white">Product Comparison</h1>
          <p className="text-sm text-[#94A3B8] mt-1">
            Compare specifications, dual-currency pricing, weight, and wholesale tiers side by side.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('shop')}
          className="px-4 py-2 rounded-md border border-white/15 text-xs font-semibold text-white hover:border-[#F5B82E] cursor-pointer"
        >
          Browse More Products
        </button>
      </div>

      {selected.length === 0 ? (
        <div className="p-12 text-center bg-[#0B1426] border border-white/10 rounded-xl space-y-3">
          <p className="text-base font-semibold text-white">No products selected for comparison</p>
          <p className="text-sm text-[#94A3B8]">Use the compare icon on any product card to add up to 4 items here.</p>
        </div>
      ) : (
        <div className="overflow-x-auto bg-[#0B1426] border border-white/10 rounded-xl">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="border-b border-white/10">
                <th className="p-4 text-xs font-semibold text-[#94A3B8] w-48">Specification</th>
                {selected.map((p) => (
                  <th key={p.id} className="p-4 min-w-[240px] align-top">
                    <div className="space-y-3">
                      <img
                        src={p.images[0]}
                        alt={p.name}
                        className="w-full h-36 object-cover rounded-lg border border-white/10"
                      />
                      <button
                        type="button"
                        onClick={() => navigate('product', p.id)}
                        className="font-semibold text-white hover:text-[#F5B82E] text-left block cursor-pointer"
                      >
                        {p.name}
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleCompare(p.id)}
                        className="inline-flex items-center gap-1 text-xs text-[#94A3B8] hover:text-red-400 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Remove</span>
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              <tr>
                <td className="p-4 text-xs text-[#94A3B8]">Category</td>
                {selected.map((p) => (
                  <td key={p.id} className="p-4 text-white">{p.categoryCode} · {p.categoryName}</td>
                ))}
              </tr>
              <tr>
                <td className="p-4 text-xs text-[#94A3B8]">TZS Price</td>
                {selected.map((p) => (
                  <td key={p.id} className="p-4 font-mono font-semibold text-[#F5B82E] tabular-nums">
                    {formatMoney(convertCurrencyMinor(p.basePriceMinor, p.baseCurrency, 'TZS', fxScaled), 'TZS')}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="p-4 text-xs text-[#94A3B8]">USD Price</td>
                {selected.map((p) => (
                  <td key={p.id} className="p-4 font-mono text-white tabular-nums">
                    {formatMoney(convertCurrencyMinor(p.basePriceMinor, p.baseCurrency, 'USD', fxScaled), 'USD')}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="p-4 text-xs text-[#94A3B8]">Merchant</td>
                {selected.map((p) => (
                  <td key={p.id} className="p-4 text-white">
                    {p.merchantName} {p.merchantVerified ? '· Verified' : ''}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="p-4 text-xs text-[#94A3B8]">Weight & Dimensions</td>
                {selected.map((p) => (
                  <td key={p.id} className="p-4 font-mono text-xs text-[#94A3B8] tabular-nums">
                    {p.weightKg} kg · {p.lengthCm}×{p.widthCm}×{p.heightCm} cm
                  </td>
                ))}
              </tr>
              <tr>
                <td className="p-4 text-xs text-[#94A3B8]">Wholesale Tiers</td>
                {selected.map((p) => (
                  <td key={p.id} className="p-4 text-xs text-[#10B981]">
                    {p.wholesaleTiers.length > 0
                      ? p.wholesaleTiers.map((t) => `${t.minQty}+ (${t.discountPercent}% off)`).join(', ')
                      : 'Standard pricing'}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="p-4 text-xs text-[#94A3B8]">Action</td>
                {selected.map((p) => (
                  <td key={p.id} className="p-4">
                    <button
                      type="button"
                      onClick={() => void addToCart(p.id, 1, p.variants[0]?.id ?? null)}
                      className="px-4 py-2 rounded-md bg-[#F5B82E] text-[#050B18] text-xs font-semibold cursor-pointer"
                    >
                      Add to Cart
                    </button>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
