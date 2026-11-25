import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, LogOut, Package, Plus, ShieldCheck } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { apiRequest } from '../lib/api';
import { formatMoney } from '../lib/finance';
import type { CurrencyCode, Product } from '../lib/types';

interface MerchantDashboardResponse {
  merchant: {
    id: string;
    business_name: string;
    verification_status: string;
    tin_number: string;
    city: string;
    country: string;
  };
  docs: Array<{ id: string; doc_type: string; file_name: string; review_status: string }>;
  metrics: {
    totalSalesTzs: number;
    totalSalesUsdCents: number;
    totalOrders: number;
    pendingOrders: number;
    completedOrders: number;
    productCount: number;
    lowStockCount: number;
    escrowHeldTzs: number;
    escrowHeldUsdCents: number;
    escrowReleasedTzs: number;
    escrowReleasedUsdCents: number;
  };
  lowStockProducts: Product[];
}

interface MerchantOrder {
  id: string;
  order_number: string;
  customer_name: string;
  status: string;
  corridor_code: string;
  total_tzs: number;
  total_usd_cents: number;
  tracking_reference: string;
  created_at: string;
}

export function MerchantDashboard() {
  const { user, logout, categories, navigate, showToast, refreshCatalog } = useStore();
  const [data, setData] = useState<MerchantDashboardResponse | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<MerchantOrder[]>([]);
  const [tab, setTab] = useState<'overview' | 'products' | 'orders' | 'add'>('overview');

  // Dynamic Add Product form state
  const [categoryId, setCategoryId] = useState('cat-01');
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [subtype, setSubtype] = useState('');
  const [description, setDescription] = useState('');
  const [baseCurrency, setBaseCurrency] = useState<CurrencyCode>('USD');
  const [priceDisplay, setPriceDisplay] = useState('150');
  const [weightKg, setWeightKg] = useState('1.2');
  const [stockQty, setStockQty] = useState('20');
  const [wholesaleMin5Pct, setWholesaleMin5Pct] = useState('10');
  const [promoPct, setPromoPct] = useState('0');
  const [attrs, setAttrs] = useState<Record<string, string | boolean>>({});
  const [busy, setBusy] = useState(false);

  const selectedCat = categories.find((c) => c.id === categoryId) ?? categories[0];

  useEffect(() => {
    if (selectedCat && selectedCat.subtypes.length > 0) {
      setSubtype(selectedCat.subtypes[0]);
    }
  }, [selectedCat]);

  const loadMerchant = useCallback(async () => {
    try {
      const [dash, prods, ords] = await Promise.all([
        apiRequest<MerchantDashboardResponse>('/merchant/dashboard'),
        apiRequest<{ products: Product[] }>('/merchant/products'),
        apiRequest<{ orders: MerchantOrder[] }>('/merchant/orders'),
      ]);
      setData(dash);
      setProducts(prods.products);
      setOrders(ords.orders);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load merchant portal', 'error');
    }
  }, [showToast]);

  useEffect(() => {
    if (user?.role === 'merchant') {
      void loadMerchant();
    }
  }, [user, loadMerchant]);

  if (!user || user.role !== 'merchant') {
    return (
      <main className="max-w-xl mx-auto px-4 py-14 text-center space-y-4">
        <p className="text-white text-lg font-semibold">Merchant authentication required</p>
        <button type="button" onClick={() => navigate('auth')} className="px-5 py-2.5 rounded-md bg-[#F5B82E] text-[#050B18] text-sm font-semibold">
          Sign In as Merchant
        </button>
      </main>
    );
  }

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const numericPrice = Number(priceDisplay);
      const basePriceMinor = baseCurrency === 'USD' ? Math.round(numericPrice * 100) : Math.round(numericPrice);
      const wPct = Number(wholesaleMin5Pct);
      const pPct = Number(promoPct);

      await apiRequest('/ecommerce/products', {
        method: 'POST',
        body: JSON.stringify({
          categoryId,
          sku: sku || `SMG-${Date.now().toString().slice(-5)}`,
          name,
          subtype,
          description,
          basePriceMinor,
          baseCurrency,
          weightKg: Number(weightKg) || 1,
          stockQty: Number(stockQty) || 10,
          attributes: attrs,
          wholesaleTiers: wPct > 0 ? [{ minQty: 5, discountPercent: wPct }] : [],
          promotion: pPct > 0 ? { type: 'percentage', value: pPct, active: true } : null,
        }),
      });
      showToast('Product published to SMG Corelink catalogue', 'success');
      setName('');
      setSku('');
      setDescription('');
      await loadMerchant();
      await refreshCatalog();
      setTab('products');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to publish product', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleQuickStockAdjust = async (productId: string, nextQty: number) => {
    try {
      await apiRequest(`/ecommerce/products/${productId}`, {
        method: 'PATCH',
        body: JSON.stringify({ stockQty: Math.max(0, nextQty) }),
      });
      await loadMerchant();
      await refreshCatalog();
      showToast('Inventory updated', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Inventory update failed', 'error');
    }
  };

  const handleOrderStatus = async (orderId: string, status: string) => {
    try {
      await apiRequest(`/merchant/orders/${orderId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await loadMerchant();
      showToast(`Order marked ${status}`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Status update failed', 'error');
    }
  };

  return (
    <main className="max-w-[1440px] mx-auto px-4 sm:px-8 py-10 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <p className="font-mono text-xs text-[#F5B82E]">
            Merchant Portal · {data?.merchant.verification_status.toUpperCase() || 'LOADING'}
          </p>
          <h1 className="font-display text-3xl font-bold text-white mt-1">
            {data?.merchant.business_name || user.fullName}
          </h1>
        </div>
        <button
          type="button"
          onClick={logout}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-white/15 text-xs font-semibold text-white cursor-pointer self-start"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign Out</span>
        </button>
      </div>

      {data && data.merchant.verification_status !== 'approved' && (
        <div className="p-4 rounded-xl bg-[#0B1426] border border-[#F5B82E]/50 text-xs text-[#F5B82E]">
          Verification status is currently <strong>{data.merchant.verification_status}</strong>. An administrator must approve your BRELA/TIN documents before new products can be published.
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {[
          { id: 'overview' as const, label: 'Sales & Escrow Overview' },
          { id: 'products' as const, label: `My Products (${products.length})` },
          { id: 'orders' as const, label: `Incoming Orders (${orders.length})` },
          { id: 'add' as const, label: 'Add New Product' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-md text-xs font-semibold cursor-pointer ${
              tab === t.id ? 'bg-[#F5B82E] text-[#050B18]' : 'bg-[#0B1426] border border-white/10 text-[#94A3B8] hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && data && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-xl bg-[#0B1426] border border-white/10">
              <p className="text-xs text-[#94A3B8]">Total Sales Volume</p>
              <p className="font-mono text-xl font-bold text-white tabular-nums mt-1">{formatMoney(data.metrics.totalSalesTzs, 'TZS')}</p>
              <p className="font-mono text-xs text-[#F5B82E] tabular-nums">{formatMoney(data.metrics.totalSalesUsdCents, 'USD')}</p>
            </div>
            <div className="p-5 rounded-xl bg-[#0B1426] border border-white/10">
              <p className="text-xs text-[#94A3B8]">Orders (Pending / Completed)</p>
              <p className="font-mono text-xl font-bold text-white tabular-nums mt-1">
                {data.metrics.totalOrders} ({data.metrics.pendingOrders} / {data.metrics.completedOrders})
              </p>
              <p className="text-xs text-[#94A3B8] mt-1">Active catalogue: {data.metrics.productCount} SKUs</p>
            </div>
            <div className="p-5 rounded-xl bg-[#0B1426] border border-white/10">
              <p className="text-xs text-[#94A3B8]">Escrow Held (Pending Delivery)</p>
              <p className="font-mono text-xl font-bold text-[#F5B82E] tabular-nums mt-1">{formatMoney(data.metrics.escrowHeldTzs, 'TZS')}</p>
              <p className="font-mono text-xs text-[#94A3B8] tabular-nums">{formatMoney(data.metrics.escrowHeldUsdCents, 'USD')}</p>
            </div>
            <div className="p-5 rounded-xl bg-[#0B1426] border border-white/10">
              <p className="text-xs text-[#94A3B8]">Escrow Released Settlement</p>
              <p className="font-mono text-xl font-bold text-[#10B981] tabular-nums mt-1">{formatMoney(data.metrics.escrowReleasedTzs, 'TZS')}</p>
              <p className="font-mono text-xs text-[#94A3B8] tabular-nums">{formatMoney(data.metrics.escrowReleasedUsdCents, 'USD')}</p>
            </div>
          </div>

          {data.lowStockProducts.length > 0 && (
            <div className="p-5 rounded-xl bg-[#0B1426] border border-amber-500/40 space-y-2">
              <div className="flex items-center gap-2 text-amber-400 text-sm font-semibold">
                <AlertTriangle className="w-4 h-4" />
                <span>Low-Stock Inventory Alerts ({data.lowStockProducts.length})</span>
              </div>
              {data.lowStockProducts.map((p) => (
                <p key={p.id} className="text-xs text-[#94A3B8]">
                  {p.sku} · {p.name} — <strong className="text-white">{p.stockQty} units remaining</strong>
                </p>
              ))}
            </div>
          )}

          <div className="p-5 rounded-xl bg-[#0B1426] border border-white/10 space-y-2">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#10B981]" />
              Submitted Business Verification Documents
            </h2>
            {data.docs.map((d) => (
              <div key={d.id} className="flex justify-between text-xs text-[#94A3B8] py-1 border-b border-white/5 last:border-0">
                <span>{d.doc_type} ({d.file_name})</span>
                <span className="font-mono text-[#10B981]">{d.review_status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'products' && (
        <div className="bg-[#0B1426] border border-white/10 rounded-xl overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-white/10 text-[#94A3B8]">
              <tr>
                <th className="p-4">SKU / Product</th>
                <th className="p-4">Category</th>
                <th className="p-4">Base Price</th>
                <th className="p-4">Stock</th>
                <th className="p-4 text-right">Quick Stock</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {products.map((p) => (
                <tr key={p.id}>
                  <td className="p-4">
                    <p className="font-semibold text-white">{p.name}</p>
                    <p className="font-mono text-[#94A3B8]">{p.sku}</p>
                  </td>
                  <td className="p-4 text-[#94A3B8]">{p.categoryCode} · {p.categoryName}</td>
                  <td className="p-4 font-mono text-[#F5B82E] tabular-nums">
                    {formatMoney(p.basePriceMinor, p.baseCurrency)}
                  </td>
                  <td className="p-4 font-mono text-white tabular-nums">{p.stockQty}</td>
                  <td className="p-4 text-right space-x-2">
                    <button
                      type="button"
                      onClick={() => void handleQuickStockAdjust(p.id, p.stockQty + 10)}
                      className="px-3 py-1.5 rounded border border-white/15 text-white hover:border-[#F5B82E] cursor-pointer"
                    >
                      +10 Stock
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'orders' && (
        <div className="space-y-3">
          {orders.length === 0 ? (
            <div className="p-8 text-center bg-[#0B1426] border border-white/10 rounded-xl text-sm text-[#94A3B8]">
              <Package className="w-6 h-6 mx-auto mb-2 text-[#F5B82E]" />
              No orders assigned yet.
            </div>
          ) : (
            orders.map((o) => (
              <div key={o.id} className="p-5 rounded-xl bg-[#0B1426] border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <p className="font-mono text-xs text-[#F5B82E]">{o.order_number} · {o.status}</p>
                  <p className="text-sm font-semibold text-white">Buyer: {o.customer_name} · Tracking: {o.tracking_reference}</p>
                  <p className="font-mono text-xs text-[#94A3B8] tabular-nums">
                    {formatMoney(o.total_tzs, 'TZS')} · {formatMoney(o.total_usd_cents, 'USD')}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {['Processing', 'Packed', 'Inspected'].map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => void handleOrderStatus(o.id, st)}
                      className="px-3 py-1.5 rounded border border-white/15 hover:border-[#F5B82E] text-xs text-white cursor-pointer"
                    >
                      Mark {st}
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'add' && (
        <form onSubmit={handleCreateProduct} className="bg-[#0B1426] border border-white/10 rounded-xl p-6 sm:p-8 space-y-5">
          <div className="flex items-center gap-2">
            <Plus className="w-5 h-5 text-[#F5B82E]" />
            <h2 className="font-display text-xl font-semibold text-white">Publish Product with Dynamic Category Schema</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="mp-cat" className="block text-xs text-[#94A3B8] mb-1">Category (CAT-01..CAT-08)</label>
              <select
                id="mp-cat"
                value={categoryId}
                onChange={(e) => {
                  setCategoryId(e.target.value);
                  setAttrs({});
                }}
                className="w-full h-10 px-3 rounded bg-[#050B18] border border-white/15 text-sm text-white"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.code} · {c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="mp-sub" className="block text-xs text-[#94A3B8] mb-1">Subtype</label>
              <select
                id="mp-sub"
                value={subtype}
                onChange={(e) => setSubtype(e.target.value)}
                className="w-full h-10 px-3 rounded bg-[#050B18] border border-white/15 text-sm text-white"
              >
                {(selectedCat?.subtypes ?? []).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="mp-sku" className="block text-xs text-[#94A3B8] mb-1">SKU</label>
              <input id="mp-sku" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="SMG-NEW-001" className="w-full h-10 px-3 rounded bg-[#050B18] border border-white/15 text-sm font-mono text-white" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="sm:col-span-2">
              <label htmlFor="mp-name" className="block text-xs text-[#94A3B8] mb-1">Product Name</label>
              <input id="mp-name" required value={name} onChange={(e) => setName(e.target.value)} className="w-full h-10 px-3 rounded bg-[#050B18] border border-white/15 text-sm text-white" />
            </div>
            <div>
              <label htmlFor="mp-curr" className="block text-xs text-[#94A3B8] mb-1">Base Currency</label>
              <select id="mp-curr" value={baseCurrency} onChange={(e) => setBaseCurrency(e.target.value as CurrencyCode)} className="w-full h-10 px-3 rounded bg-[#050B18] border border-white/15 text-sm text-white">
                <option value="USD">USD</option>
                <option value="TZS">TZS</option>
              </select>
            </div>
            <div>
              <label htmlFor="mp-price" className="block text-xs text-[#94A3B8] mb-1">Base Price ({baseCurrency})</label>
              <input id="mp-price" type="number" step="0.01" required value={priceDisplay} onChange={(e) => setPriceDisplay(e.target.value)} className="w-full h-10 px-3 rounded bg-[#050B18] border border-white/15 text-sm font-mono text-white" />
            </div>
          </div>

          <div>
            <label htmlFor="mp-desc" className="block text-xs text-[#94A3B8] mb-1">Description</label>
            <textarea id="mp-desc" rows={2} required value={description} onChange={(e) => setDescription(e.target.value)} className="w-full p-3 rounded bg-[#050B18] border border-white/15 text-sm text-white" />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label htmlFor="mp-wt" className="block text-xs text-[#94A3B8] mb-1">Weight (kg)</label>
              <input id="mp-wt" type="number" step="0.1" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} className="w-full h-10 px-3 rounded bg-[#050B18] border border-white/15 text-sm font-mono text-white" />
            </div>
            <div>
              <label htmlFor="mp-stk" className="block text-xs text-[#94A3B8] mb-1">Initial Stock</label>
              <input id="mp-stk" type="number" value={stockQty} onChange={(e) => setStockQty(e.target.value)} className="w-full h-10 px-3 rounded bg-[#050B18] border border-white/15 text-sm font-mono text-white" />
            </div>
            <div>
              <label htmlFor="mp-wh" className="block text-xs text-[#94A3B8] mb-1">5+ Units Discount %</label>
              <input id="mp-wh" type="number" value={wholesaleMin5Pct} onChange={(e) => setWholesaleMin5Pct(e.target.value)} className="w-full h-10 px-3 rounded bg-[#050B18] border border-white/15 text-sm font-mono text-white" />
            </div>
            <div>
              <label htmlFor="mp-pr" className="block text-xs text-[#94A3B8] mb-1">Promo Discount %</label>
              <input id="mp-pr" type="number" value={promoPct} onChange={(e) => setPromoPct(e.target.value)} className="w-full h-10 px-3 rounded bg-[#050B18] border border-white/15 text-sm font-mono text-white" />
            </div>
          </div>

          {/* Dynamic Category Attribute Fields */}
          {selectedCat && (
            <div className="p-4 rounded-lg bg-[#050B18] border border-white/10 space-y-3">
              <p className="text-xs font-semibold text-[#F5B82E]">{selectedCat.code} Category Attributes</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {selectedCat.attributeSchema.map((field) => (
                  <div key={field.key}>
                    <label className="block text-[11px] text-[#94A3B8] mb-1">{field.label}</label>
                    {field.type === 'select' && field.options ? (
                      <select
                        value={String(attrs[field.key] ?? field.options[0])}
                        onChange={(e) => setAttrs((prev) => ({ ...prev, [field.key]: e.target.value }))}
                        className="w-full h-9 px-2.5 rounded bg-[#0B1426] border border-white/15 text-xs text-white"
                      >
                        {field.options.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    ) : field.type === 'boolean' ? (
                      <label className="inline-flex items-center gap-2 text-xs text-white h-9">
                        <input
                          type="checkbox"
                          checked={Boolean(attrs[field.key])}
                          onChange={(e) => setAttrs((prev) => ({ ...prev, [field.key]: e.target.checked }))}
                          className="accent-[#F5B82E]"
                        />
                        <span>Yes</span>
                      </label>
                    ) : (
                      <input
                        value={String(attrs[field.key] ?? '')}
                        onChange={(e) => setAttrs((prev) => ({ ...prev, [field.key]: e.target.value }))}
                        placeholder={field.unit || field.label}
                        className="w-full h-9 px-2.5 rounded bg-[#0B1426] border border-white/15 text-xs text-white"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <button type="submit" disabled={busy} className="px-6 py-3 rounded-md bg-[#F5B82E] text-[#050B18] text-sm font-semibold cursor-pointer">
            {busy ? 'Publishing...' : 'Publish Product'}
          </button>
        </form>
      )}
    </main>
  );
}
