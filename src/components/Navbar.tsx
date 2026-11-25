import React, { useState } from 'react';
import { ArrowUpRight, Menu, ShoppingBag, X } from 'lucide-react';
import { useStore } from '../context/StoreContext';

export function Navbar() {
  const { route, navigate, user, cartItems } = useStore();
  const [mobileOpen, setMobileOpen] = useState(false);

  const cartCount = cartItems.reduce((sum, i) => sum + i.quantity, 0);

  const goPortal = () => {
    setMobileOpen(false);
    if (!user) {
      navigate('auth');
      return;
    }
    if (user.role === 'admin') navigate('admin-dashboard');
    else if (user.role === 'merchant') navigate('merchant-dashboard');
    else if (user.role === 'operations') navigate('operations-dashboard');
    else navigate('account');
  };

  const navLinkCls = (active: boolean) =>
    `relative text-sm font-medium whitespace-nowrap shrink-0 px-1 py-2 transition-colors after:absolute after:bottom-0 after:left-1 after:h-px after:rounded-full after:transition-all ${
      active
        ? 'text-[#48E0C1] after:w-[calc(100%-0.5rem)] after:bg-[#48E0C1]'
        : 'text-[#A7C4D6] after:w-0 after:bg-[#48E0C1] hover:text-white hover:after:w-[calc(100%-0.5rem)]'
    }`;

  return (
    <header className="sticky top-0 z-40 bg-[#061A28]/90 backdrop-blur-xl border-b border-white/10 shadow-[0_8px_30px_rgba(0,0,0,0.12)]">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-8">
        {/* Brand mark and wordmark */}
        <a
          href="?page=home"
          onClick={(e) => {
            e.preventDefault();
            navigate('home');
            setMobileOpen(false);
          }}
          className="group inline-flex items-center gap-2.5 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#48E0C1] rounded-lg"
        >
          <span className="grid place-items-center w-10 h-10 rounded-xl bg-[#0B2638] border border-[#48E0C1]/30 shadow-[0_6px_18px_rgba(0,0,0,0.2)]">
            <svg viewBox="0 0 40 40" aria-hidden="true" className="w-8 h-8">
              <defs>
                <linearGradient id="corelink-mark" x1="8" y1="7" x2="33" y2="34" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#71F1D2" />
                  <stop offset="1" stopColor="#1B9FAC" />
                </linearGradient>
              </defs>
              <path d="M29.7 11.1A12.1 12.1 0 1 0 31 27.3" fill="none" stroke="url(#corelink-mark)" strokeWidth="4.2" strokeLinecap="round" />
              <path d="M21.8 20h10.1M27 14.8l5.2 5.2-5.2 5.2" fill="none" stroke="#F7C55A" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="11" cy="10.2" r="2.4" fill="#F7C55A" />
            </svg>
          </span>
          <span className="leading-none">
            <span className="block text-[0.65rem] tracking-[0.28em] font-bold text-[#48E0C1]">SMG</span>
            <span className="block mt-0.5 text-base font-extrabold tracking-[-0.04em] text-white">CORELINK</span>
          </span>
        </a>

        {/* Zone 2: 5 concise single-line text links */}
        <nav aria-label="Primary navigation" className="hidden md:flex items-center gap-7">
          <a
            href="?page=shop"
            onClick={(e) => {
              e.preventDefault();
              navigate('shop');
            }}
            className={navLinkCls(route.page === 'shop' || route.page === 'category')}
          >
            Shop
          </a>
          <a
            href="?page=compare"
            onClick={(e) => {
              e.preventDefault();
              navigate('compare');
            }}
            className={navLinkCls(route.page === 'compare')}
          >
            Compare
          </a>
          <a
            href="?page=tracking"
            onClick={(e) => {
              e.preventDefault();
              navigate('tracking');
            }}
            className={navLinkCls(route.page === 'tracking')}
          >
            Track Order
          </a>
          <a
            href="?page=merchant-register"
            onClick={(e) => {
              e.preventDefault();
              navigate('merchant-register');
            }}
            className={navLinkCls(route.page === 'merchant-register')}
          >
            Sell on Corelink
          </a>
          <a
            href="?page=cart"
            onClick={(e) => {
              e.preventDefault();
              navigate('cart');
            }}
            className={`${navLinkCls(route.page === 'cart' || route.page === 'checkout')} inline-flex items-center gap-1.5`}
          >
            <ShoppingBag className="w-4 h-4" />
            <span>Cart ({cartCount})</span>
          </a>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => navigate('cart')}
            aria-label={`Open shopping cart with ${cartCount} items`}
            className="md:hidden inline-flex items-center gap-1.5 px-3 min-h-[44px] text-sm font-medium text-white hover:text-[#F5B82E] whitespace-nowrap shrink-0"
          >
            <ShoppingBag className="w-4 h-4" />
            <span className="tabular-nums">{cartCount}</span>
          </button>

          <button
            type="button"
            onClick={goPortal}
            className="hidden md:inline-flex items-center justify-center gap-1.5 px-4 py-2 min-h-[40px] rounded-xl bg-[#48E0C1] hover:bg-[#72ECCF] text-[#061A28] text-sm font-bold transition-all hover:-translate-y-px hover:shadow-[0_8px_20px_rgba(72,224,193,0.22)] whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            {user
              ? user.role === 'admin'
                ? 'Admin Console'
                : user.role === 'merchant'
                ? 'Merchant Portal'
                : user.role === 'operations'
                ? 'Logistics Ops'
                : 'My Account'
              : 'Sign In'}
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileOpen}
            className="md:hidden inline-flex items-center justify-center w-11 h-11 rounded-md border border-white/15 text-white hover:border-[#F5B82E]"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden bg-[#0B1426] border-t border-white/10 px-4 py-4 space-y-2">
          {[
            { label: 'Shop All Products', page: 'shop' as const },
            { label: 'Compare Products', page: 'compare' as const },
            { label: 'Track Order', page: 'tracking' as const },
            { label: 'Wishlist', page: 'wishlist' as const },
            { label: 'Sell on Corelink', page: 'merchant-register' as const },
            { label: 'About SMG Corelink', page: 'about' as const },
          ].map((item) => (
            <button
              key={item.page}
              type="button"
              onClick={() => {
                navigate(item.page);
                setMobileOpen(false);
              }}
              className="w-full text-left px-3 py-2.5 min-h-[44px] text-sm font-medium text-white hover:bg-white/5 rounded-md"
            >
              {item.label}
            </button>
          ))}
          <button
            type="button"
            onClick={goPortal}
            className="w-full mt-2 px-4 py-3 min-h-[44px] rounded-md bg-[#F5B82E] text-[#050B18] text-sm font-semibold"
          >
            {user ? `Open ${user.role.toUpperCase()} Portal` : 'Sign In / Register'}
          </button>
        </div>
      )}
    </header>
  );
}
