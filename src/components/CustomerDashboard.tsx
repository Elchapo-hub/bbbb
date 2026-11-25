import React, { useEffect, useState } from 'react';
import { Bell, FileDown, Heart, LogOut, MapPin, Package, RotateCcw, User } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { apiRequest } from '../lib/api';
import { formatMoney } from '../lib/finance';
import { downloadOrderInvoicePdf, type InvoiceDocumentPayload } from '../lib/pdfInvoice';
import { ProductCard } from './ProductCard';
import type { Product } from '../lib/types';

interface CustomerOrderSummary {
  id: string;
  order_number: string;
  status: string;
  corridor_code: string;
  incoterm: string;
  destination_zone: string;
  total_tzs: number;
  total_usd_cents: number;
  merchant_name: string;
  tracking_reference: string;
  shipment_status: string;
  invoice_number: string;
  created_at: string;
}

interface AddressRow {
  id: string;
  label: string;
  recipient_name: string;
  phone: string;
  country: string;
  region_or_city: string;
  district: string;
  street_address: string;
}

interface NotificationRow {
  id: string;
  title: string;
  message: string;
  is_read: number;
  created_at: string;
}

export function CustomerDashboard({ initialTab = 'orders' }: { initialTab?: 'orders' | 'wishlist' | 'profile' | 'addresses' | 'notifications' }) {
  const { user, setUser, logout, navigate, showToast, setDisplayCurrency } = useStore();
  const [tab, setTab] = useState(initialTab);
  const [orders, setOrders] = useState<CustomerOrderSummary[]>([]);
  const [wishlistProducts, setWishlistProducts] = useState<Product[]>([]);
  const [addresses, setAddresses] = useState<AddressRow[]>([]);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [returnOrderId, setReturnOrderId] = useState<string | null>(null);
  const [returnReason, setReturnReason] = useState('');

  // Profile form
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [prefCurr, setPrefCurr] = useState<'TZS' | 'USD'>(user?.preferredCurrency ?? 'TZS');
  const [tinNumber, setTinNumber] = useState(user?.tinNumber ?? '');

  // New Address form
  const [addrLabel, setAddrLabel] = useState('Home');
  const [addrCity, setAddrCity] = useState('Dar es Salaam');
  const [addrDistrict, setAddrDistrict] = useState('Kinondoni');
  const [addrStreet, setAddrStreet] = useState('');

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (!user) return;
    apiRequest<{ orders: CustomerOrderSummary[] }>('/ecommerce/orders').then((r) => setOrders(r.orders)).catch(() => {});
    apiRequest<{ products: Product[] }>('/ecommerce/wishlist').then((r) => setWishlistProducts(r.products)).catch(() => {});
    apiRequest<{ addresses: AddressRow[] }>('/ecommerce/addresses').then((r) => setAddresses(r.addresses)).catch(() => {});
    apiRequest<{ notifications: NotificationRow[] }>('/ecommerce/notifications').then((r) => setNotifications(r.notifications)).catch(() => {});
  }, [user]);

  if (!user) {
    return (
      <main className="max-w-xl mx-auto px-4 py-14 text-center space-y-4">
        <p className="text-white text-lg font-semibold">Sign in to view your customer dashboard</p>
        <button type="button" onClick={() => navigate('auth')} className="px-5 py-2.5 rounded-md bg-[#F5B82E] text-[#050B18] text-sm font-semibold">
          Sign In
        </button>
      </main>
    );
  }

  const handleDownloadPdf = async (orderId: string, corridorCode: string) => {
    try {
      const payload = await apiRequest<InvoiceDocumentPayload>(`/ecommerce/orders/${orderId}/invoice`);
      downloadOrderInvoicePdf(
        payload,
        corridorCode === 'LOG-03' || corridorCode === 'LOG-04' ? 'Commercial Invoice' : 'Customer Invoice'
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to generate invoice PDF', 'error');
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({ fullName, phone, preferredCurrency: prefCurr, tinNumber }),
      });
      setUser({ ...user, fullName, phone, preferredCurrency: prefCurr, tinNumber });
      setDisplayCurrency(prefCurr);
      showToast('Profile updated', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Update failed', 'error');
    }
  };

  const handleAddAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/ecommerce/addresses', {
        method: 'POST',
        body: JSON.stringify({
          label: addrLabel,
          recipientName: user.fullName,
          phone: user.phone || '+255754000000',
          country: 'Tanzania',
          regionOrCity: addrCity,
          district: addrDistrict,
          streetAddress: addrStreet,
          isDefault: addresses.length === 0,
        }),
      });
      const r = await apiRequest<{ addresses: AddressRow[] }>('/ecommerce/addresses');
      setAddresses(r.addresses);
      setAddrStreet('');
      showToast('Delivery address saved', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not save address', 'error');
    }
  };

  const handleReturnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnOrderId) return;
    try {
      await apiRequest(`/ecommerce/orders/${returnOrderId}/returns`, {
        method: 'POST',
        body: JSON.stringify({ reason: returnReason }),
      });
      setReturnOrderId(null);
      setReturnReason('');
      showToast('Return & refund request submitted to admin queue', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Return request failed', 'error');
    }
  };

  return (
    <main className="max-w-[1440px] mx-auto px-4 sm:px-8 py-10 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <p className="font-mono text-xs text-[#F5B82E]">Customer Account · {user.email}</p>
          <h1 className="font-display text-3xl font-bold text-white mt-1">Welcome, {user.fullName}</h1>
        </div>
        <button
          type="button"
          onClick={logout}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-white/15 text-xs font-semibold text-white hover:border-red-400 cursor-pointer self-start"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign Out</span>
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { id: 'orders' as const, label: 'Orders & Invoices', icon: Package },
          { id: 'wishlist' as const, label: `Wishlist (${wishlistProducts.length})`, icon: Heart },
          { id: 'addresses' as const, label: 'Saved Addresses', icon: MapPin },
          { id: 'notifications' as const, label: `Notifications (${notifications.filter((n) => !n.is_read).length})`, icon: Bell },
          { id: 'profile' as const, label: 'Profile & Tax', icon: User },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-xs font-semibold cursor-pointer ${
                tab === item.id ? 'bg-[#F5B82E] text-[#050B18]' : 'bg-[#0B1426] border border-white/10 text-[#94A3B8] hover:text-white'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {tab === 'orders' && (
        <div className="space-y-4">
          {orders.length === 0 ? (
            <div className="p-10 text-center bg-[#0B1426] border border-white/10 rounded-xl space-y-3">
              <p className="text-white font-semibold">No orders placed yet</p>
              <button type="button" onClick={() => navigate('shop')} className="px-5 py-2 rounded-md bg-[#F5B82E] text-[#050B18] text-xs font-semibold">
                Start Shopping
              </button>
            </div>
          ) : (
            orders.map((o) => (
              <div key={o.id} className="p-5 rounded-xl bg-[#0B1426] border border-white/10 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[#94A3B8]">
                    <span className="font-mono text-[#F5B82E] font-semibold">{o.order_number}</span>
                    <span>·</span>
                    <span>{o.status}</span>
                    <span>·</span>
                    <span>{o.corridor_code} ({o.incoterm})</span>
                    <span>·</span>
                    <span>{o.destination_zone}</span>
                  </div>
                  <p className="text-sm font-medium text-white">
                    Merchant: {o.merchant_name} · Tracking: <span className="font-mono">{o.tracking_reference}</span>
                  </p>
                  <p className="font-mono text-sm text-white tabular-nums">
                    {formatMoney(o.total_tzs, 'TZS')} · {formatMoney(o.total_usd_cents, 'USD')}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => navigate('tracking', o.order_number)}
                    className="px-3.5 py-2 rounded-md border border-white/15 text-xs font-semibold text-white hover:border-[#F5B82E] cursor-pointer"
                  >
                    Track Milestones
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDownloadPdf(o.id, o.corridor_code)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-[#F5B82E] text-[#050B18] text-xs font-semibold cursor-pointer"
                  >
                    <FileDown className="w-3.5 h-3.5" />
                    <span>PDF Invoice</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setReturnOrderId(o.id)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-white/15 text-xs text-[#94A3B8] hover:text-white cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Return</span>
                  </button>
                </div>
              </div>
            ))
          )}

          {returnOrderId && (
            <form onSubmit={handleReturnSubmit} className="p-5 rounded-xl bg-[#0B1426] border border-[#F5B82E]/40 space-y-3">
              <h3 className="text-sm font-semibold text-white">Request Return & Refund</h3>
              <textarea
                required
                rows={2}
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
                placeholder="Describe reason for return (damaged item, sizing exchange, missing component)..."
                className="w-full p-3 rounded-md bg-[#050B18] border border-white/15 text-sm text-white"
              />
              <div className="flex gap-2">
                <button type="submit" className="px-4 py-2 rounded-md bg-[#F5B82E] text-[#050B18] text-xs font-semibold cursor-pointer">
                  Submit Request
                </button>
                <button type="button" onClick={() => setReturnOrderId(null)} className="px-4 py-2 rounded-md border border-white/15 text-xs text-white cursor-pointer">
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {tab === 'wishlist' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {wishlistProducts.length === 0 ? (
            <p className="text-sm text-[#94A3B8]">No saved wishlist items yet.</p>
          ) : (
            wishlistProducts.map((p) => <ProductCard key={p.id} product={p} />)
          )}
        </div>
      )}

      {tab === 'addresses' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-3">
            {addresses.map((a) => (
              <div key={a.id} className="p-4 rounded-xl bg-[#0B1426] border border-white/10 space-y-1 text-sm">
                <p className="font-semibold text-white">{a.label} · {a.recipient_name}</p>
                <p className="text-xs text-[#94A3B8]">{a.street_address}, {a.district}, {a.region_or_city}, {a.country}</p>
                <p className="text-xs text-[#94A3B8]">{a.phone}</p>
              </div>
            ))}
          </div>
          <form onSubmit={handleAddAddress} className="p-6 rounded-xl bg-[#0B1426] border border-white/10 space-y-3">
            <h3 className="font-semibold text-white">Add Delivery Address</h3>
            <div className="grid grid-cols-2 gap-3">
              <input required value={addrLabel} onChange={(e) => setAddrLabel(e.target.value)} placeholder="Label (Office)" className="h-10 px-3 rounded bg-[#050B18] border border-white/15 text-sm text-white" />
              <input required value={addrCity} onChange={(e) => setAddrCity(e.target.value)} placeholder="City" className="h-10 px-3 rounded bg-[#050B18] border border-white/15 text-sm text-white" />
            </div>
            <input required value={addrDistrict} onChange={(e) => setAddrDistrict(e.target.value)} placeholder="District" className="w-full h-10 px-3 rounded bg-[#050B18] border border-white/15 text-sm text-white" />
            <input required value={addrStreet} onChange={(e) => setAddrStreet(e.target.value)} placeholder="Street / Plot" className="w-full h-10 px-3 rounded bg-[#050B18] border border-white/15 text-sm text-white" />
            <button type="submit" className="px-5 py-2.5 rounded-md bg-[#F5B82E] text-[#050B18] text-xs font-semibold cursor-pointer">
              Save Address
            </button>
          </form>
        </div>
      )}

      {tab === 'notifications' && (
        <div className="space-y-3">
          {notifications.length === 0 ? (
            <p className="text-sm text-[#94A3B8]">No notifications yet.</p>
          ) : (
            notifications.map((n) => (
              <div key={n.id} className="p-4 rounded-xl bg-[#0B1426] border border-white/10 flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-white">{n.title}</p>
                  <p className="text-xs text-[#94A3B8] mt-1">{n.message}</p>
                </div>
                <span className="font-mono text-[11px] text-[#94A3B8] shrink-0">{new Date(n.created_at).toLocaleDateString()}</span>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'profile' && (
        <form onSubmit={handleSaveProfile} className="max-w-xl bg-[#0B1426] border border-white/10 rounded-xl p-6 space-y-4">
          <h3 className="font-semibold text-white">Profile & Tax Settings</h3>
          <div>
            <label htmlFor="prof-name" className="block text-xs text-[#94A3B8] mb-1">Full Name</label>
            <input id="prof-name" value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full h-10 px-3 rounded bg-[#050B18] border border-white/15 text-sm text-white" />
          </div>
          <div>
            <label htmlFor="prof-phone" className="block text-xs text-[#94A3B8] mb-1">Phone</label>
            <input id="prof-phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full h-10 px-3 rounded bg-[#050B18] border border-white/15 text-sm text-white" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="prof-curr" className="block text-xs text-[#94A3B8] mb-1">Display Currency</label>
              <select id="prof-curr" value={prefCurr} onChange={(e) => setPrefCurr(e.target.value as 'TZS' | 'USD')} className="w-full h-10 px-3 rounded bg-[#050B18] border border-white/15 text-sm text-white">
                <option value="TZS">TZS Primary</option>
                <option value="USD">USD Primary</option>
              </select>
            </div>
            <div>
              <label htmlFor="prof-tin" className="block text-xs text-[#94A3B8] mb-1">TIN Number (Optional)</label>
              <input id="prof-tin" value={tinNumber} onChange={(e) => setTinNumber(e.target.value)} className="w-full h-10 px-3 rounded bg-[#050B18] border border-white/15 text-sm text-white" />
            </div>
          </div>
          <button type="submit" className="px-5 py-2.5 rounded-md bg-[#F5B82E] text-[#050B18] text-xs font-semibold cursor-pointer">
            Save Profile
          </button>
        </form>
      )}
    </main>
  );
}
