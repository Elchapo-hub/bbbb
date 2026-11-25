import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Globe, Search, ShieldCheck, Sparkles, Truck } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { ProductCard } from './ProductCard';

const categoryImages: Record<string, string> = {
  'CAT-01': '/src/assets/images/cat_mens_tailoring_1795560175189.jpg',
  'CAT-02': '/src/assets/images/cat_mens_shoes_1795561230666.jpg',
  'CAT-03': '/src/assets/images/cat_womens_fashion_1795560176226.jpg',
  'CAT-04': '/src/assets/images/cat_womens_fashion_1795560176226.jpg',
  'CAT-05': '/src/assets/images/cat_watches_handbags_1795560175849.jpg',
  'CAT-06': '/src/assets/images/cat_watches_handbags_1795560175849.jpg',
  'CAT-07': '/src/assets/images/cat_tech_electrical_1795560176959.jpg',
  'CAT-08': '/src/assets/images/cat_electrical_switchgear_1795561231149.jpg',
};

const heroSlides = [
  {
    image: '/src/assets/images/hero_corelink_commerce_1795560174816.jpg',
    label: 'Executive essentials',
    detail: 'Tailoring, timepieces, and technology',
  },
  {
    image: '/src/assets/images/cat_tech_electrical_1795560176959.jpg',
    label: 'Verified technology',
    detail: 'Connected for modern business',
  },
  {
    image: '/src/assets/images/cat_electrical_switchgear_1795561231149.jpg',
    label: 'Certified infrastructure',
    detail: 'Built for projects that deliver',
  },
  {
    image: '/src/assets/images/cat_watches_handbags_1795560175849.jpg',
    label: 'Considered goods',
    detail: 'Sourced with provenance',
  },
];

export function HomePage() {
  const {
    navigate,
    categories,
    products,
    fx,
    displayCurrency,
    setDisplayCurrency,
    searchQuery,
    setSearchQuery,
    loadingCatalog,
  } = useStore();

  const [collectionTab, setCollectionTab] = useState<'featured' | 'new' | 'best'>('featured');
  const [typedText, setTypedText] = useState('');
  const [typingIndex, setTypingIndex] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [heroSlide, setHeroSlide] = useState(0);
  const heroPhrases = ['Tanzania to the world.', 'Trade with confidence.', 'Built for every order.'];
  const heroPhrase = heroPhrases[typingIndex];

  useEffect(() => {
    const atEnd = typedText === heroPhrase;
    const atStart = typedText.length === 0;
    const delay = atEnd ? 1700 : deleting ? 32 : 62;
    const timer = window.setTimeout(() => {
      if (atEnd) return setDeleting(true);
      if (deleting && atStart) {
        setDeleting(false);
        setTypingIndex((index) => (index + 1) % heroPhrases.length);
        return;
      }
      setTypedText((current) =>
        deleting ? current.slice(0, -1) : heroPhrase.slice(0, current.length + 1)
      );
    }, delay);
    return () => window.clearTimeout(timer);
  }, [deleting, heroPhrase, heroPhrases.length, typedText]);

  useEffect(() => {
    const rotation = window.setInterval(() => {
      setHeroSlide((current) => (current + 1) % heroSlides.length);
    }, 5200);
    return () => window.clearInterval(rotation);
  }, []);

  const showcasedProducts = useMemo(() => {
    if (collectionTab === 'new') return products.filter((p) => p.isNewArrival).slice(0, 6);
    if (collectionTab === 'best') return products.filter((p) => p.isBestSeller).slice(0, 6);
    return products.filter((p) => p.isFeatured).slice(0, 6);
  }, [collectionTab, products]);

  const handleHeroSearch = (e: React.FormEvent) => {
    e.preventDefault();
    navigate('search');
  };

  return (
    <main>
      {/* 1. Split Editorial Hero Section */}
      <section
        className="hero-surface border-b border-white/10 overflow-hidden"
        style={{ backgroundImage: `url(${heroSlides[heroSlide].image})` }}
      >
        <div className="max-w-[1440px] mx-auto px-4 sm:px-8 py-12 lg:py-20 grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
          <div className="lg:col-span-6 flex flex-col justify-between gap-8 rounded-2xl bg-[#061A28]/78 p-6 sm:p-8 border border-white/10 backdrop-blur-sm shadow-2xl shadow-black/20">
            <div className="space-y-5">
              <div className="inline-flex flex-wrap items-center gap-2 rounded-full border border-[#48E0C1]/25 bg-[#061A28]/60 px-3 py-1.5 text-xs text-[#A7C4D6] shadow-lg shadow-black/10">
                <Sparkles className="w-3.5 h-3.5 text-[#48E0C1]" />
                <span className="font-semibold text-[#48E0C1]">Trusted East African commerce</span>
                <span aria-hidden="true">·</span>
                <span>TZS & USD · Protected delivery</span>
              </div>

              <h1 className="font-display text-4xl sm:text-5xl xl:text-6xl font-bold text-white leading-[1.06] tracking-tight max-w-2xl">
                Commerce that moves with you.
                <span className="block mt-2 text-[#48E0C1] hero-word-cursor min-h-[1.1em]">{typedText}</span>
              </h1>

              <p className="text-base text-[#A7C4D6] leading-relaxed max-w-xl">
                Discover verified Tanzanian suppliers for considered essentials, professional technology, and certified infrastructure—priced clearly in both TZS and USD.
              </p>

              <form onSubmit={handleHeroSearch} className="flex flex-col sm:flex-row gap-3 pt-1">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-[#94A3B8] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search suits, iPhones, armoured cable, SKU..."
                    aria-label="Search products"
                    className="w-full h-12 pl-10 pr-4 rounded-xl bg-[#061A28]/85 border border-white/15 text-sm text-white placeholder:text-[#A7C4D6] shadow-lg shadow-black/10 focus:outline-none focus:border-[#48E0C1]"
                  />
                </div>
                <button
                  type="submit"
                  className="px-6 h-12 rounded-xl bg-[#48E0C1] hover:bg-[#72ECCF] text-[#061A28] text-sm font-bold inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer transition-all hover:-translate-y-px hover:shadow-[0_10px_25px_rgba(72,224,193,0.22)]"
                >
                  <span>Explore Catalogue</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            </div>

            {/* Currency Display Preference & Live FX Indicator */}
            <div className="flex flex-wrap items-center justify-between gap-4 pt-5 border-t border-white/10">
              <div className="flex items-center gap-3">
                <span className="text-xs text-[#94A3B8]">Primary Currency:</span>
                <div className="inline-flex p-1 rounded-md bg-[#0B1426] border border-white/10">
                  {(['TZS', 'USD'] as const).map((curr) => (
                    <button
                      key={curr}
                      type="button"
                      onClick={() => setDisplayCurrency(curr)}
                      className={`px-3 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${
                        displayCurrency === curr
                          ? 'bg-[#F5B82E] text-[#050B18]'
                          : 'text-[#94A3B8] hover:text-white'
                      }`}
                    >
                      {curr}
                    </button>
                  ))}
                </div>
              </div>

              {fx && (
                <p className="font-mono text-xs text-[#94A3B8] tabular-nums">
                  1 USD = <span className="text-white font-semibold">{fx.effectiveRate.toLocaleString('en-US')} TZS</span> · 15-min checkout lock
                </p>
              )}
            </div>
          </div>

          <div className="lg:col-span-6 relative">
            <div className="h-full min-h-[360px] rounded-2xl overflow-hidden border border-white/10 bg-[#0B1426] shadow-2xl shadow-black/30">
              <img
                key={heroSlides[heroSlide].image}
                src={heroSlides[heroSlide].image}
                alt={heroSlides[heroSlide].detail}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover object-center scale-[1.02] animate-[hero-image-in_700ms_ease-out]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#061A28]/80 via-transparent to-transparent" />
              <div className="absolute left-5 right-5 bottom-5 flex items-end justify-between gap-4">
                <div>
                  <p className="text-[0.68rem] uppercase tracking-[0.18em] text-[#48E0C1] font-bold">{heroSlides[heroSlide].label}</p>
                  <p className="mt-1 text-sm font-semibold text-white">{heroSlides[heroSlide].detail}</p>
                </div>
                <div className="hidden sm:block rounded-xl border border-white/15 bg-[#061A28]/70 px-3 py-2 backdrop-blur">
                  <p className="text-xs text-[#A7C4D6]">Suppliers checked</p>
                  <p className="text-lg font-bold text-white">100%</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Eight Product Categories Showcase */}
      <section className="max-w-[1440px] mx-auto px-4 sm:px-8 py-14 border-b border-white/10">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <h2 className="font-display text-2xl sm:text-3xl font-semibold text-white">
              Eight Regulated Trade Categories
            </h2>
            <p className="text-sm text-[#94A3B8] mt-1">
              Structured technical specifications, wholesale volume tiers, and authenticity guarantees across every vertical.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('shop')}
            className="text-sm font-medium text-[#F5B82E] hover:underline inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <span>Browse All Products</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => navigate('category', cat.code)}
              className="group text-left rounded-xl overflow-hidden bg-[#0B1426] border border-white/10 hover:border-[#48E0C1]/60 transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-black/20 flex flex-col justify-between cursor-pointer"
            >
              <div className="relative h-28 overflow-hidden bg-[#061A28]">
                <img
                  src={categoryImages[cat.code]}
                  alt=""
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0B1426] via-[#0B1426]/10 to-transparent" />
                <p className="absolute left-5 bottom-3 font-mono text-xs text-[#48E0C1]">{cat.code}</p>
              </div>
              <div className="p-5 pt-3">
                <h3 className="text-base font-semibold text-white">{cat.name}</h3>
                <p className="text-xs text-[#A7C4D6] mt-1.5 line-clamp-2">{cat.description}</p>
                <span className="mt-4 text-xs font-semibold text-[#48E0C1] inline-flex items-center gap-1">
                  <span>Explore category</span>
                  <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
                </span>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* 3. Featured, New Arrivals & Best Sellers Collection */}
      <section className="max-w-[1440px] mx-auto px-4 sm:px-8 py-14 border-b border-white/10">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h2 className="font-display text-2xl sm:text-3xl font-semibold text-white">
              Curated Marketplace Selection
            </h2>
            <p className="text-sm text-[#94A3B8] mt-1">
              Every listing displays live TZS and USD values, verified seller provenance, and instant cart addition.
            </p>
          </div>

          <div className="inline-flex p-1 rounded-lg bg-[#0B1426] border border-white/10 self-start">
            {[
              { id: 'featured' as const, label: 'Featured' },
              { id: 'new' as const, label: 'New Arrivals' },
              { id: 'best' as const, label: 'Best Sellers' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setCollectionTab(tab.id)}
                className={`px-4 py-2 rounded-md text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  collectionTab === tab.id
                    ? 'bg-[#F5B82E] text-[#050B18]'
                    : 'text-[#94A3B8] hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {loadingCatalog ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-80 rounded-xl bg-[#0B1426] border border-white/10 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {showcasedProducts.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </section>

      {/* 4. Wholesale B2B, International Corridors & Verified Merchants */}
      <section className="max-w-[1440px] mx-auto px-4 sm:px-8 py-14 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="p-6 rounded-xl bg-[#0B1426] border border-white/10 space-y-3">
          <ShieldCheck className="w-6 h-6 text-[#10B981]" />
          <h3 className="text-lg font-semibold text-white">Verified Merchants & Escrow</h3>
          <p className="text-sm text-[#94A3B8] leading-relaxed">
            Every merchant undergoes BRELA and TRA TIN verification prior to listing. Corelink Milestone Escrow holds funds until domestic OTP or export document confirmation.
          </p>
          <button
            type="button"
            onClick={() => navigate('merchant-register')}
            className="text-xs font-semibold text-[#F5B82E] hover:underline cursor-pointer"
          >
            Apply as a Verified Merchant →
          </button>
        </div>

        <div className="p-6 rounded-xl bg-[#0B1426] border border-white/10 space-y-3">
          <Truck className="w-6 h-6 text-[#F5B82E]" />
          <h3 className="text-lg font-semibold text-white">Four Logistics Corridors</h3>
          <p className="text-sm text-[#94A3B8] leading-relaxed">
            From 2–6 hour Dar Express DDP courier to Upcountry Tanzania, EAC/SADC road freight (DAP), and Global Air & Sea Export (CIF/EXW) with volumetric weight calculation.
          </p>
          <button
            type="button"
            onClick={() => navigate('tracking')}
            className="text-xs font-semibold text-[#F5B82E] hover:underline cursor-pointer"
          >
            Track an Active Shipment →
          </button>
        </div>

        <div className="p-6 rounded-xl bg-[#0B1426] border border-white/10 space-y-3">
          <Globe className="w-6 h-6 text-[#F5B82E]" />
          <h3 className="text-lg font-semibold text-white">Wholesale Tiered Pricing</h3>
          <p className="text-sm text-[#94A3B8] leading-relaxed">
            Order 5+, 15+, or 30+ units across apparel, electronics, and electrical switchgear to unlock automatic server-validated B2B volume discounts and commercial invoices.
          </p>
          <button
            type="button"
            onClick={() => navigate('shop')}
            className="text-xs font-semibold text-[#F5B82E] hover:underline cursor-pointer"
          >
            Browse B2B Bulk Stock →
          </button>
        </div>
      </section>

      {/* 5. Attributable Buyer Testimonials */}
      <section className="max-w-[1440px] mx-auto px-4 sm:px-8 pb-6">
        <div className="p-8 rounded-xl bg-[#0B1426] border border-white/10 grid grid-cols-1 md:grid-cols-2 gap-8">
          <blockquote className="space-y-2">
            <p className="text-sm text-white leading-relaxed">
              “We sourced 15 drums of 16mm² armoured copper cable for our Nairobi industrial expansion with full TBS certificates and DAP Namanga clearance. Locking USD/TZS at checkout removed FX surprises.”
            </p>
            <footer className="text-xs text-[#94A3B8]">
              Daniel Ochieng · Procurement Lead, Rift Grid Engineering Ltd (EAC Corridor LOG-03)
            </footer>
          </blockquote>
          <blockquote className="space-y-2">
            <p className="text-sm text-white leading-relaxed">
              “Our corporate tailoring order arrived in Masaki inside 4 hours under Dar Express with OTP handover verification and downloadable VAT invoice ready for our finance team.”
            </p>
            <footer className="text-xs text-[#94A3B8]">
              Rehema Mwakasege · Corporate Services Director, Pwani Advisory Group (Dar Express LOG-01)
            </footer>
          </blockquote>
        </div>
      </section>
    </main>
  );
}
