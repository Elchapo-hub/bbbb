import React, { useMemo, useState } from 'react';
import { Search, SlidersHorizontal } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { computeEffectiveRateScaled, convertCurrencyMinor } from '../lib/finance';
import { ProductCard } from './ProductCard';

export function CatalogPage({ mode }: { mode: 'shop' | 'category' | 'search' }) {
  const {
    route,
    navigate,
    categories,
    products,
    fx,
    displayCurrency,
    setDisplayCurrency,
    searchQuery,
    setSearchQuery,
  } = useStore();

  const [selectedCategory, setSelectedCategory] = useState<string>(
    mode === 'category' && route.param ? route.param : 'ALL'
  );
  const [sortBy, setSortBy] = useState<'featured' | 'price_asc' | 'price_desc' | 'newest'>('featured');
  const [onlyInStock, setOnlyInStock] = useState(false);
  const [maxPriceUsd, setMaxPriceUsd] = useState<number>(2000);

  const activeCategoryCode = mode === 'category' && route.param ? route.param : selectedCategory;
  const activeCatObj = categories.find(
    (c) => c.code.toLowerCase() === activeCategoryCode.toLowerCase() || c.slug === activeCategoryCode
  );

  const fxScaled = computeEffectiveRateScaled(fx?.midRate ?? 2680, fx?.spreadBps ?? 120);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = products.filter((p) => {
      if (activeCategoryCode !== 'ALL') {
        const matchesCat =
          p.categoryCode.toLowerCase() === activeCategoryCode.toLowerCase() ||
          p.categoryId === activeCategoryCode;
        if (!matchesCat) return false;
      }
      if (onlyInStock && p.stockQty <= 0) return false;
      const usdCents = convertCurrencyMinor(p.basePriceMinor, p.baseCurrency, 'USD', fxScaled);
      if (usdCents > maxPriceUsd * 100) return false;
      if (q) {
        const hay = `${p.name} ${p.description} ${p.categoryName} ${p.subtype} ${p.merchantName} ${p.sku}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    if (sortBy === 'price_asc') {
      return [...list].sort(
        (a, b) =>
          convertCurrencyMinor(a.basePriceMinor, a.baseCurrency, 'USD', fxScaled) -
          convertCurrencyMinor(b.basePriceMinor, b.baseCurrency, 'USD', fxScaled)
      );
    }
    if (sortBy === 'price_desc') {
      return [...list].sort(
        (a, b) =>
          convertCurrencyMinor(b.basePriceMinor, b.baseCurrency, 'USD', fxScaled) -
          convertCurrencyMinor(a.basePriceMinor, a.baseCurrency, 'USD', fxScaled)
      );
    }
    if (sortBy === 'newest') {
      return [...list].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    }
    return list;
  }, [activeCategoryCode, fxScaled, maxPriceUsd, onlyInStock, products, searchQuery, sortBy]);

  return (
    <main className="max-w-[1440px] mx-auto px-4 sm:px-8 py-10 space-y-8">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 border-b border-white/10 pb-6">
        <div>
          <p className="font-mono text-xs text-[#F5B82E]">
            {activeCatObj ? `${activeCatObj.code} · Category Catalogue` : mode === 'search' ? 'Search Results' : 'All Categories'}
          </p>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-white mt-1">
            {activeCatObj ? activeCatObj.name : mode === 'search' ? `Results for "${searchQuery || 'All'}"` : 'SMG Corelink Marketplace'}
          </h1>
          <p className="text-sm text-[#94A3B8] mt-1.5 max-w-2xl">
            {activeCatObj
              ? activeCatObj.description
              : 'Browse domestic & export-ready inventory priced dynamically in TZS and USD.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-[#94A3B8]">Primary Currency:</span>
          <div className="inline-flex p-1 rounded-md bg-[#0B1426] border border-white/10">
            {(['TZS', 'USD'] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setDisplayCurrency(c)}
                className={`px-3 py-1.5 rounded text-xs font-semibold cursor-pointer ${
                  displayCurrency === c ? 'bg-[#F5B82E] text-[#050B18]' : 'text-[#94A3B8] hover:text-white'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center bg-[#0B1426] border border-white/10 rounded-xl p-4">
        <div className="lg:col-span-4 relative">
          <Search className="w-4 h-4 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter by product, SKU, merchant..."
            aria-label="Filter catalogue"
            className="w-full h-10 pl-9 pr-3 rounded-md bg-[#050B18] border border-white/15 text-sm text-white placeholder:text-[#94A3B8] focus:outline-none focus:border-[#F5B82E]"
          />
        </div>

        <div className="lg:col-span-3">
          <select
            aria-label="Filter by category"
            value={activeCategoryCode}
            onChange={(e) => {
              const val = e.target.value;
              setSelectedCategory(val);
              if (val === 'ALL') navigate('shop');
              else navigate('category', val);
            }}
            className="w-full h-10 px-3 rounded-md bg-[#050B18] border border-white/15 text-sm text-white focus:outline-none focus:border-[#F5B82E]"
          >
            <option value="ALL">All 8 Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.code}>
                {c.code} · {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="lg:col-span-2">
          <select
            aria-label="Sort products"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="w-full h-10 px-3 rounded-md bg-[#050B18] border border-white/15 text-sm text-white focus:outline-none focus:border-[#F5B82E]"
          >
            <option value="featured">Featured First</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="price_desc">Price: High to Low</option>
            <option value="newest">Newest Arrivals</option>
          </select>
        </div>

        <div className="lg:col-span-3 flex items-center justify-between gap-3 text-xs text-[#94A3B8]">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={onlyInStock}
              onChange={(e) => setOnlyInStock(e.target.checked)}
              className="accent-[#F5B82E]"
            />
            <span>In stock only</span>
          </label>
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-3.5 h-3.5 text-[#F5B82E]" />
            <span className="font-mono tabular-nums">Max ${maxPriceUsd}</span>
            <input
              type="range"
              min={100}
              max={2000}
              step={50}
              value={maxPriceUsd}
              onChange={(e) => setMaxPriceUsd(Number(e.target.value))}
              aria-label="Maximum USD price filter"
              className="w-20 accent-[#F5B82E]"
            />
          </div>
        </div>
      </div>

      {/* Results Count */}
      <div className="flex items-center justify-between text-xs text-[#94A3B8]">
        <p className="tabular-nums">Showing {filteredProducts.length} verified products</p>
        {(activeCategoryCode !== 'ALL' || searchQuery) && (
          <button
            type="button"
            onClick={() => {
              setSelectedCategory('ALL');
              setSearchQuery('');
              navigate('shop');
            }}
            className="text-[#F5B82E] hover:underline cursor-pointer"
          >
            Clear Filters
          </button>
        )}
      </div>

      {filteredProducts.length === 0 ? (
        <div className="p-12 text-center rounded-xl bg-[#0B1426] border border-white/10 space-y-3">
          <p className="text-lg font-semibold text-white">No matching products found</p>
          <p className="text-sm text-[#94A3B8]">
            Try broadening your search terms, selecting all categories, or increasing the maximum price limit.
          </p>
          <button
            type="button"
            onClick={() => {
              setSelectedCategory('ALL');
              setSearchQuery('');
              setMaxPriceUsd(2000);
              setOnlyInStock(false);
              navigate('shop');
            }}
            className="px-5 py-2.5 rounded-md bg-[#F5B82E] text-[#050B18] text-xs font-semibold cursor-pointer"
          >
            Reset Catalogue Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProducts.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </main>
  );
}
