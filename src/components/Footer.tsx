import React from 'react';
import { useStore } from '../context/StoreContext';

export function Footer() {
  const { navigate, fx, categories } = useStore();

  return (
    <footer className="bg-[#0B1426] border-t border-white/10 mt-20">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-8 py-14 grid grid-cols-1 md:grid-cols-4 gap-10">
        <div className="space-y-3">
          <p className="font-display text-lg font-bold text-white">SMG CORELINK</p>
          <p className="text-sm text-[#94A3B8] leading-relaxed">
            Tanzanian domestic and international B2C & B2B trade platform. Verified merchants, dual-currency TZS/USD settlement, and milestone-protected logistics.
          </p>
          <p className="text-xs text-[#94A3B8]">
            Ohio Street, Ilala, Dar es Salaam, Tanzania
          </p>
          {fx && (
            <p className="text-xs font-mono tabular-nums text-[#F5B82E]">
              Reference FX: 1 USD = {fx.effectiveRate.toLocaleString('en-US')} TZS ({fx.source})
            </p>
          )}
        </div>

        <div>
          <h3 className="text-sm font-semibold text-white mb-4">Catalogue</h3>
          <ul className="space-y-2 text-sm text-[#94A3B8]">
            {categories.slice(0, 6).map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => navigate('category', c.code)}
                  className="hover:text-[#F5B82E] transition-colors text-left cursor-pointer"
                >
                  {c.code} · {c.name}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-white mb-4">Commerce & Portals</h3>
          <ul className="space-y-2 text-sm text-[#94A3B8]">
            <li><button type="button" onClick={() => navigate('shop')} className="hover:text-[#F5B82E] cursor-pointer">Shop All Products</button></li>
            <li><button type="button" onClick={() => navigate('compare')} className="hover:text-[#F5B82E] cursor-pointer">Product Comparison</button></li>
            <li><button type="button" onClick={() => navigate('tracking')} className="hover:text-[#F5B82E] cursor-pointer">Track Shipment</button></li>
            <li><button type="button" onClick={() => navigate('wishlist')} className="hover:text-[#F5B82E] cursor-pointer">Saved Wishlist</button></li>
            <li><button type="button" onClick={() => navigate('merchant-register')} className="hover:text-[#F5B82E] cursor-pointer">Merchant Registration</button></li>
            <li><button type="button" onClick={() => navigate('auth')} className="hover:text-[#F5B82E] cursor-pointer">Account & Role Portals</button></li>
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-white mb-4">Company & Governance</h3>
          <ul className="space-y-2 text-sm text-[#94A3B8]">
            <li><button type="button" onClick={() => navigate('about')} className="hover:text-[#F5B82E] cursor-pointer">About SMG Corelink</button></li>
            <li><button type="button" onClick={() => navigate('contact')} className="hover:text-[#F5B82E] cursor-pointer">Contact & Trade Desk</button></li>
            <li><button type="button" onClick={() => navigate('help')} className="hover:text-[#F5B82E] cursor-pointer">Help & Support</button></li>
            <li><button type="button" onClick={() => navigate('terms')} className="hover:text-[#F5B82E] cursor-pointer">Terms & Conditions</button></li>
            <li><button type="button" onClick={() => navigate('privacy')} className="hover:text-[#F5B82E] cursor-pointer">Privacy Policy</button></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#94A3B8]">
          <p>© {new Date().getFullYear()} SMG Corelink Ltd. Registered in Tanzania.</p>
          <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4 text-center">
            <p>Commercial invoices issued electronically; statutory fiscal receipts require approved TRA EFD integration.</p>
            <p className="whitespace-nowrap font-semibold text-[#48E0C1]">Architectured by Zeph-Codes</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
