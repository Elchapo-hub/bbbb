import React, { useCallback, useEffect, useState } from 'react';
import { LogOut, RefreshCw, ShieldCheck } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { apiRequest } from '../lib/api';
import { formatMoney } from '../lib/finance';
import type { ExchangeRateRecord, ShippingCorridor, TaxRule } from '../lib/types';

interface AdminDashboardData {
  metrics: {
    totalRevenueTzs: number;
    totalRevenueUsdCents: number;
    totalOrders: number;
    pendingOrders: number;
    completedOrders: number;
    totalCustomers: number;
    totalMerchants: number;
    verifiedMerchants: number;
    pendingMerchantApprovals: number;
    totalProducts: number;
    lowStockCount: number;
    pendingPayments: number;
    escrowHeldTzs: number;
    escrowHeldUsdCents: number;
    escrowReleasedTzs: number;
    escrowReleasedUsdCents: number;
    pendingRefunds: number;
  };
  lowStockProducts: Array<{ id: string; name: string; stock_qty: number }>;
  recentOrders: Array<{ id: string; order_number: string; status: string; total_tzs: number; total_usd_cents: number; corridor_code: string; created_at: string }>;
  recentPayments: Array<{ id: string; order_number: string; payment_method: string; provider: string; provider_reference: string; amount_tzs: number; status: string }>;
  fx: ExchangeRateRecord;
}

export function AdminDashboard() {
  const { user, logout, navigate, showToast, refreshCatalog } = useStore();
  const [tab, setTab] = useState<'overview' | 'merchants' | 'orders' | 'finance' | 'config' | 'users'>('overview');
  const [dash, setDash] = useState<AdminDashboardData | null>(null);
  const [merchants, setMerchants] = useState<Array<{ id: string; business_name: string; email: string; tin_number: string; city: string; verification_status: string; documents: Array<{ id: string; doc_type: string; file_name: string; review_status: string }> }>>([]);
  const [orders, setOrders] = useState<Array<{ id: string; order_number: string; customer_name: string; merchant_name: string; status: string; corridor_code: string; total_tzs: number; total_usd_cents: number }>>([]);
  const [payments, setPayments] = useState<Array<{ id: string; order_number: string; payment_method: string; provider: string; provider_reference: string; proof_url: string | null; amount_tzs: number; status: string }>>([]);
  const [escrowAccounts, setEscrowAccounts] = useState<Array<{ id: string; order_number: string; merchant_name: string; corridor_code: string; state: string; held_tzs: number; held_usd_cents: number; released_tzs: number }>>([]);
  const [refunds, setRefunds] = useState<Array<{ id: string; order_number: string; reason: string; amount_tzs: number; status: string }>>([]);
  const [corridors, setCorridors] = useState<ShippingCorridor[]>([]);
  const [taxRules, setTaxRules] = useState<TaxRule[]>([]);
  const [coupons, setCoupons] = useState<Array<{ id: string; code: string; discount_type: string; discount_value: number; active: number }>>([]);
  const [users, setUsers] = useState<Array<{ id: string; email: string; full_name: string; role: string; status: string }>>([]);
  const [auditLogs, setAuditLogs] = useState<Array<{ id: string; action: string; entity_type: string; entity_id: string; created_at: string }>>([]);

  // FX & Coupon forms
  const [fxMid, setFxMid] = useState('2680');
  const [fxSpread, setFxSpread] = useState('120');
  const [fxSource, setFxSource] = useState('Bank of Tanzania Reference');
  const [newCouponCode, setNewCouponCode] = useState('');
  const [newCouponPct, setNewCouponPct] = useState('10');

  const loadAll = useCallback(async () => {
    try {
      const [d, m, o, p, e, r, c, t, cp, u, al] = await Promise.all([
        apiRequest<AdminDashboardData>('/admin/dashboard'),
        apiRequest<{ merchants: typeof merchants }>('/admin/merchants'),
        apiRequest<{ orders: typeof orders }>('/admin/orders'),
        apiRequest<{ payments: typeof payments }>('/admin/payments'),
        apiRequest<{ accounts: typeof escrowAccounts }>('/admin/escrow'),
        apiRequest<{ refunds: typeof refunds }>('/admin/refunds'),
        apiRequest<{ corridors: ShippingCorridor[] }>('/admin/corridors'),
        apiRequest<{ taxRules: TaxRule[] }>('/admin/taxes'),
        apiRequest<{ coupons: typeof coupons }>('/admin/coupons'),
        apiRequest<{ users: typeof users }>('/admin/users'),
        apiRequest<{ logs: typeof auditLogs }>('/admin/audit-logs'),
      ]);
      setDash(d);
      setFxMid(String(d.fx.midRate));
      setFxSpread(String(d.fx.spreadBps));
      setMerchants(m.merchants);
      setOrders(o.orders);
      setPayments(p.payments);
      setEscrowAccounts(e.accounts);
      setRefunds(r.refunds);
      setCorridors(c.corridors);
      setTaxRules(t.taxRules);
      setCoupons(cp.coupons);
      setUsers(u.users);
      setAuditLogs(al.logs);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load admin console', 'error');
    }
  }, [showToast]);

  useEffect(() => {
    if (user?.role === 'admin') void loadAll();
  }, [user, loadAll]);

  if (!user || user.role !== 'admin') {
    return (
      <main className="max-w-xl mx-auto px-4 py-14 text-center space-y-4">
        <p className="text-white text-lg font-semibold">Administrator authorization required</p>
        <button type="button" onClick={() => navigate('auth')} className="px-5 py-2.5 rounded-md bg-[#F5B82E] text-[#050B18] text-sm font-semibold">
          Open Admin Access
        </button>
      </main>
    );
  }

  const updateMerchantStatus = async (id: string, status: string) => {
    await apiRequest(`/admin/merchants/${id}/verification`, { method: 'PATCH', body: JSON.stringify({ status }) });
    showToast(`Merchant status updated to ${status}`, 'success');
    await loadAll();
    await refreshCatalog();
  };

  const reconcilePayment = async (id: string, decision: 'confirm' | 'reject') => {
    await apiRequest(`/admin/payments/${id}/reconcile`, { method: 'POST', body: JSON.stringify({ decision }) });
    showToast(`Payment ${decision}ed`, 'success');
    await loadAll();
  };

  const releaseEscrow = async (id: string) => {
    try {
      await apiRequest(`/admin/escrow/${id}/release`, { method: 'POST' });
      showToast('Escrow released to merchant ledger', 'success');
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Release blocked', 'error');
    }
  };

  const saveFxRate = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiRequest('/admin/fx', {
      method: 'POST',
      body: JSON.stringify({ midRate: Number(fxMid), spreadBps: Number(fxSpread), source: fxSource }),
    });
    showToast('Exchange rate updated & historical record saved', 'success');
    await loadAll();
    await refreshCatalog();
  };

  const saveTaxRules = async () => {
    await apiRequest('/admin/taxes', { method: 'PATCH', body: JSON.stringify({ taxRules }) });
    showToast('Tax rates configuration saved', 'success');
  };

  const updateCorridorRate = async (c: ShippingCorridor) => {
    await apiRequest(`/admin/corridors/${c.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        baseRateMinor: c.baseRateMinor,
        perKgRateMinor: c.perKgRateMinor,
        insuranceRateBps: c.insuranceRateBps,
      }),
    });
    showToast(`Updated ${c.code} corridor rates`, 'success');
    await loadAll();
    await refreshCatalog();
  };

  return (
    <main className="max-w-[1440px] mx-auto px-4 sm:px-8 py-10 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <p className="font-mono text-xs text-[#F5B82E]">SMG Corelink Governance</p>
          <h1 className="font-display text-3xl font-bold text-white mt-1">Administrator Control Console</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void loadAll()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-white/15 text-xs text-white hover:border-[#F5B82E] cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={logout}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md border border-white/15 text-xs font-semibold text-white cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { id: 'overview' as const, label: 'Executive Overview' },
          { id: 'merchants' as const, label: `Merchants (${merchants.length})` },
          { id: 'orders' as const, label: `Orders & Refunds (${orders.length})` },
          { id: 'finance' as const, label: 'Payments & Escrow Ledger' },
          { id: 'config' as const, label: 'FX, Taxes, Corridors & Coupons' },
          { id: 'users' as const, label: 'Users & Audit Logs' },
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

      {tab === 'overview' && dash && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-xl bg-[#0B1426] border border-white/10">
              <p className="text-xs text-[#94A3B8]">Total Gross Order Volume</p>
              <p className="font-mono text-xl font-bold text-[#F5B82E] tabular-nums mt-1">{formatMoney(dash.metrics.totalRevenueTzs, 'TZS')}</p>
              <p className="font-mono text-xs text-white tabular-nums">{formatMoney(dash.metrics.totalRevenueUsdCents, 'USD')}</p>
            </div>
            <div className="p-5 rounded-xl bg-[#0B1426] border border-white/10">
              <p className="text-xs text-[#94A3B8]">Orders (Pending / Completed)</p>
              <p className="font-mono text-xl font-bold text-white tabular-nums mt-1">
                {dash.metrics.totalOrders} ({dash.metrics.pendingOrders} / {dash.metrics.completedOrders})
              </p>
              <p className="text-xs text-[#94A3B8] mt-1">Pending payments: {dash.metrics.pendingPayments} · Refunds: {dash.metrics.pendingRefunds}</p>
            </div>
            <div className="p-5 rounded-xl bg-[#0B1426] border border-white/10">
              <p className="text-xs text-[#94A3B8]">Merchants & Customers</p>
              <p className="font-mono text-xl font-bold text-white tabular-nums mt-1">
                {dash.metrics.verifiedMerchants}/{dash.metrics.totalMerchants} Verified · {dash.metrics.totalCustomers} Buyers
              </p>
              <p className="text-xs text-amber-400 mt-1">Pending approvals: {dash.metrics.pendingMerchantApprovals}</p>
            </div>
            <div className="p-5 rounded-xl bg-[#0B1426] border border-white/10">
              <p className="text-xs text-[#94A3B8]">Escrow Held / Released</p>
              <p className="font-mono text-xl font-bold text-[#10B981] tabular-nums mt-1">{formatMoney(dash.metrics.escrowHeldTzs, 'TZS')}</p>
              <p className="font-mono text-xs text-[#94A3B8] tabular-nums">Released: {formatMoney(dash.metrics.escrowReleasedTzs, 'TZS')}</p>
            </div>
          </div>

          {/* Real DB Revenue by Recent Orders Visual Bar Chart */}
          <div className="p-6 rounded-xl bg-[#0B1426] border border-white/10 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-white">Order Value Breakdown (USD Equivalent)</h2>
              <span className="font-mono text-xs text-[#94A3B8]">Products: {dash.metrics.totalProducts} · Low stock: {dash.metrics.lowStockCount}</span>
            </div>
            <div className="space-y-2.5">
              {dash.recentOrders.map((o) => {
                const maxUsd = Math.max(1, ...dash.recentOrders.map((x) => x.total_usd_cents));
                const pct = Math.max(8, Math.round((o.total_usd_cents / maxUsd) * 100));
                return (
                  <div key={o.id} className="grid grid-cols-12 items-center gap-3 text-xs">
                    <span className="col-span-3 sm:col-span-2 font-mono text-white">{o.order_number}</span>
                    <div className="col-span-6 sm:col-span-8 h-6 rounded bg-[#050B18] overflow-hidden border border-white/5">
                      <div className="h-full bg-[#F5B82E]" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="col-span-3 sm:col-span-2 text-right font-mono text-white tabular-nums">
                      {formatMoney(o.total_usd_cents, 'USD')}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {tab === 'merchants' && (
        <div className="space-y-4">
          {merchants.map((m) => (
            <div key={m.id} className="p-5 rounded-xl bg-[#0B1426] border border-white/10 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-white">{m.business_name}</h3>
                  <span className={`font-mono text-xs ${m.verification_status === 'approved' ? 'text-[#10B981]' : 'text-[#F5B82E]'}`}>
                    {m.verification_status.toUpperCase()}
                  </span>
                </div>
                <p className="text-xs text-[#94A3B8]">
                  {m.email} · TIN {m.tin_number} · {m.city}
                </p>
                <p className="text-xs text-[#94A3B8]">
                  Docs: {m.documents.map((d) => `${d.doc_type} (${d.file_name})`).join(' · ') || 'None'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void updateMerchantStatus(m.id, 'approved')} className="px-3.5 py-2 rounded bg-[#10B981] text-[#050B18] text-xs font-semibold cursor-pointer">
                  Approve
                </button>
                <button type="button" onClick={() => void updateMerchantStatus(m.id, 'rejected')} className="px-3.5 py-2 rounded border border-red-400/50 text-red-300 text-xs font-semibold cursor-pointer">
                  Reject
                </button>
                <button type="button" onClick={() => void updateMerchantStatus(m.id, 'suspended')} className="px-3.5 py-2 rounded border border-white/15 text-[#94A3B8] text-xs cursor-pointer">
                  Suspend
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'orders' && (
        <div className="space-y-6">
          <div className="bg-[#0B1426] border border-white/10 rounded-xl overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-white/10 text-[#94A3B8]">
                <tr>
                  <th className="p-4">Order</th>
                  <th className="p-4">Buyer / Merchant</th>
                  <th className="p-4">Corridor</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Total (TZS / USD)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td className="p-4 font-mono text-[#F5B82E]">{o.order_number}</td>
                    <td className="p-4 text-white">{o.customer_name} → {o.merchant_name}</td>
                    <td className="p-4 font-mono text-[#94A3B8]">{o.corridor_code}</td>
                    <td className="p-4 text-white">{o.status}</td>
                    <td className="p-4 text-right font-mono tabular-nums text-white">
                      {formatMoney(o.total_tzs, 'TZS')} / {formatMoney(o.total_usd_cents, 'USD')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="p-5 rounded-xl bg-[#0B1426] border border-white/10 space-y-3">
            <h2 className="text-sm font-semibold text-white">Return & Refund Queue</h2>
            {refunds.length === 0 ? (
              <p className="text-xs text-[#94A3B8]">No refund requests pending.</p>
            ) : (
              refunds.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-2 border-b border-white/10 last:border-0 text-xs">
                  <div>
                    <span className="font-mono text-[#F5B82E]">{r.order_number}</span> · {r.reason} · <strong className="text-white">{r.status}</strong>
                  </div>
                  {r.status === 'pending' && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          await apiRequest(`/admin/refunds/${r.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'approved' }) });
                          showToast('Refund approved', 'success');
                          await loadAll();
                        }}
                        className="px-3 py-1.5 rounded bg-[#10B981] text-[#050B18] font-semibold cursor-pointer"
                      >
                        Approve Refund
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {tab === 'finance' && (
        <div className="space-y-6">
          <div className="p-5 rounded-xl bg-[#0B1426] border border-white/10 space-y-3">
            <h2 className="font-display text-lg font-semibold text-white">Payments & Bank Transfer Reconciliation</h2>
            {payments.map((p) => (
              <div key={p.id} className="p-4 rounded-lg bg-[#050B18] border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div>
                  <p className="font-mono text-[#F5B82E]">{p.order_number} · {p.provider_reference}</p>
                  <p className="text-white">{p.payment_method} ({p.provider}) · {formatMoney(p.amount_tzs, 'TZS')} · Status: <strong>{p.status}</strong></p>
                  {p.proof_url && <p className="text-[#10B981]">Proof uploaded: {p.proof_url}</p>}
                </div>
                {p.status !== 'confirmed' && (
                  <div className="flex gap-2">
                    <button type="button" onClick={() => void reconcilePayment(p.id, 'confirm')} className="px-3 py-1.5 rounded bg-[#10B981] text-[#050B18] font-semibold cursor-pointer">
                      Verify & Confirm
                    </button>
                    <button type="button" onClick={() => void reconcilePayment(p.id, 'reject')} className="px-3 py-1.5 rounded border border-red-400/50 text-red-300 font-semibold cursor-pointer">
                      Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="p-5 rounded-xl bg-[#0B1426] border border-white/10 space-y-3">
            <h2 className="font-display text-lg font-semibold text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[#10B981]" />
              Corelink Milestone Escrow Ledger
            </h2>
            {escrowAccounts.map((e) => (
              <div key={e.id} className="p-4 rounded-lg bg-[#050B18] border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div>
                  <p className="font-mono text-[#F5B82E]">{e.order_number} · {e.corridor_code}</p>
                  <p className="text-white">{e.merchant_name} · State: <strong>{e.state}</strong></p>
                  <p className="font-mono text-[#94A3B8] tabular-nums">
                    Held: {formatMoney(e.held_tzs, 'TZS')} · Released: {formatMoney(e.released_tzs, 'TZS')}
                  </p>
                </div>
                {e.held_tzs > 0 && (
                  <button
                    type="button"
                    onClick={() => void releaseEscrow(e.id)}
                    className="px-4 py-2 rounded bg-[#F5B82E] text-[#050B18] font-semibold cursor-pointer"
                  >
                    Release Escrow Settlement
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'config' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* FX Rate Editor */}
          <form onSubmit={saveFxRate} className="p-6 rounded-xl bg-[#0B1426] border border-white/10 space-y-4">
            <h2 className="font-display text-lg font-semibold text-white">FX Rate Management (USD / TZS)</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[#94A3B8] mb-1">Mid Rate (TZS per 1 USD)</label>
                <input type="number" step="0.01" value={fxMid} onChange={(e) => setFxMid(e.target.value)} className="w-full h-10 px-3 rounded bg-[#050B18] border border-white/15 font-mono text-sm text-white" />
              </div>
              <div>
                <label className="block text-xs text-[#94A3B8] mb-1">FX Spread (bps, 100 = 1%)</label>
                <input type="number" value={fxSpread} onChange={(e) => setFxSpread(e.target.value)} className="w-full h-10 px-3 rounded bg-[#050B18] border border-white/15 font-mono text-sm text-white" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-[#94A3B8] mb-1">Rate Source</label>
              <input value={fxSource} onChange={(e) => setFxSource(e.target.value)} className="w-full h-10 px-3 rounded bg-[#050B18] border border-white/15 text-sm text-white" />
            </div>
            <button type="submit" className="px-5 py-2.5 rounded bg-[#F5B82E] text-[#050B18] text-xs font-semibold cursor-pointer">
              Update Active FX Rate
            </button>
          </form>

          {/* Coupons */}
          <div className="p-6 rounded-xl bg-[#0B1426] border border-white/10 space-y-4">
            <h2 className="font-display text-lg font-semibold text-white">Discount Coupons</h2>
            <div className="flex gap-2">
              <input value={newCouponCode} onChange={(e) => setNewCouponCode(e.target.value.toUpperCase())} placeholder="NEWCODE" className="flex-1 h-9 px-3 rounded bg-[#050B18] border border-white/15 font-mono text-xs text-white" />
              <input type="number" value={newCouponPct} onChange={(e) => setNewCouponPct(e.target.value)} className="w-20 h-9 px-3 rounded bg-[#050B18] border border-white/15 font-mono text-xs text-white" />
              <button
                type="button"
                onClick={async () => {
                  if (!newCouponCode) return;
                  await apiRequest('/admin/coupons', {
                    method: 'POST',
                    body: JSON.stringify({ code: newCouponCode, discountType: 'percentage', discountValue: Number(newCouponPct) }),
                  });
                  setNewCouponCode('');
                  await loadAll();
                }}
                className="px-4 h-9 rounded bg-[#F5B82E] text-[#050B18] text-xs font-semibold cursor-pointer"
              >
                Add % Coupon
              </button>
            </div>
            <div className="space-y-2 text-xs">
              {coupons.map((c) => (
                <div key={c.id} className="flex items-center justify-between py-1.5 border-b border-white/10">
                  <span className="font-mono text-white">{c.code} ({c.discount_type}: {c.discount_value})</span>
                  <button
                    type="button"
                    onClick={async () => {
                      await apiRequest(`/admin/coupons/${c.id}`, { method: 'PATCH', body: JSON.stringify({ active: !c.active }) });
                      await loadAll();
                    }}
                    className={`px-2.5 py-1 rounded border cursor-pointer ${c.active ? 'border-[#10B981] text-[#10B981]' : 'border-white/20 text-[#94A3B8]'}`}
                  >
                    {c.active ? 'Active' : 'Disabled'}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Tax Rules */}
          <div className="p-6 rounded-xl bg-[#0B1426] border border-white/10 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-white">VAT & Tax Rules (TRA Configurable)</h2>
              <button type="button" onClick={() => void saveTaxRules()} className="px-3.5 py-1.5 rounded bg-[#F5B82E] text-[#050B18] text-xs font-semibold cursor-pointer">
                Save Taxes
              </button>
            </div>
            {taxRules.map((tr, idx) => (
              <div key={tr.id} className="flex items-center justify-between gap-3 text-xs py-2 border-b border-white/10">
                <div>
                  <p className="font-mono text-[#F5B82E]">{tr.code}</p>
                  <p className="text-white">{tr.name}</p>
                </div>
                <input
                  type="number"
                  value={tr.rateBps}
                  onChange={(e) => {
                    const next = [...taxRules];
                    next[idx] = { ...tr, rateBps: Number(e.target.value) };
                    setTaxRules(next);
                  }}
                  aria-label={`Rate bps for ${tr.code}`}
                  className="w-24 h-8 px-2 rounded bg-[#050B18] border border-white/15 font-mono text-white text-right"
                />
              </div>
            ))}
          </div>

          {/* Shipping Corridors */}
          <div className="p-6 rounded-xl bg-[#0B1426] border border-white/10 space-y-4">
            <h2 className="font-display text-lg font-semibold text-white">Shipping Corridor Rates</h2>
            {corridors.map((c, idx) => (
              <div key={c.id} className="p-3 rounded bg-[#050B18] border border-white/10 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="font-mono text-[#F5B82E]">{c.code} · {c.name} ({c.incoterm})</span>
                  <button type="button" onClick={() => void updateCorridorRate(c)} className="text-[#10B981] font-semibold cursor-pointer">
                    Save Rate
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <span className="text-[11px] text-[#94A3B8]">Base ({c.baseCurrency})</span>
                    <input
                      type="number"
                      value={c.baseRateMinor}
                      onChange={(e) => {
                        const next = [...corridors];
                        next[idx] = { ...c, baseRateMinor: Number(e.target.value) };
                        setCorridors(next);
                      }}
                      className="w-full h-8 px-2 rounded bg-[#0B1426] border border-white/15 font-mono text-white"
                    />
                  </div>
                  <div>
                    <span className="text-[11px] text-[#94A3B8]">Per kg ({c.baseCurrency})</span>
                    <input
                      type="number"
                      value={c.perKgRateMinor}
                      onChange={(e) => {
                        const next = [...corridors];
                        next[idx] = { ...c, perKgRateMinor: Number(e.target.value) };
                        setCorridors(next);
                      }}
                      className="w-full h-8 px-2 rounded bg-[#0B1426] border border-white/15 font-mono text-white"
                    />
                  </div>
                  <div>
                    <span className="text-[11px] text-[#94A3B8]">Ins (bps)</span>
                    <input
                      type="number"
                      value={c.insuranceRateBps}
                      onChange={(e) => {
                        const next = [...corridors];
                        next[idx] = { ...c, insuranceRateBps: Number(e.target.value) };
                        setCorridors(next);
                      }}
                      className="w-full h-8 px-2 rounded bg-[#0B1426] border border-white/15 font-mono text-white"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'users' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="p-5 rounded-xl bg-[#0B1426] border border-white/10 space-y-3">
            <h2 className="font-display text-lg font-semibold text-white">Platform Users & Access Status</h2>
            {users.map((u) => (
              <div key={u.id} className="flex items-center justify-between text-xs py-2 border-b border-white/10">
                <div>
                  <p className="font-semibold text-white">{u.full_name} ({u.role})</p>
                  <p className="text-[#94A3B8]">{u.email}</p>
                </div>
                {u.role !== 'admin' && (
                  <button
                    type="button"
                    onClick={async () => {
                      const next = u.status === 'active' ? 'suspended' : 'active';
                      await apiRequest(`/admin/users/${u.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: next }) });
                      await loadAll();
                    }}
                    className={`px-3 py-1 rounded border cursor-pointer ${
                      u.status === 'active' ? 'border-[#10B981] text-[#10B981]' : 'border-red-400 text-red-400'
                    }`}
                  >
                    {u.status === 'active' ? 'Active (Suspend)' : 'Suspended (Reactivate)'}
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="p-5 rounded-xl bg-[#0B1426] border border-white/10 space-y-3">
            <h2 className="font-display text-lg font-semibold text-white">Security & Financial Audit Logs</h2>
            <div className="space-y-2 max-h-96 overflow-y-auto text-xs">
              {auditLogs.map((l) => (
                <div key={l.id} className="flex justify-between gap-3 py-1.5 border-b border-white/5">
                  <span className="font-mono text-[#F5B82E]">{l.action}</span>
                  <span className="text-[#94A3B8] truncate">{l.entity_type} · {l.entity_id}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
