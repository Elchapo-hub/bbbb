import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, KeyRound, LogOut, Truck } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { apiRequest } from '../lib/api';
import { formatMoney } from '../lib/finance';

interface OpsShipment {
  id: string;
  order_id: string;
  order_number: string;
  order_status: string;
  corridor_code: string;
  tracking_reference: string;
  status: string;
  packed_inspected: number;
  shipping_doc_url: string | null;
  destination_zone: string;
  incoterm: string;
  total_tzs: number;
  total_usd_cents: number;
  recipient_name: string;
  phone: string;
  street_address: string;
  otp_hint: string;
  otp_verified: number;
}

export function OperationsDashboard() {
  const { user, logout, navigate, showToast } = useStore();
  const [shipments, setShipments] = useState<OpsShipment[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState('Dispatched');
  const [location, setLocation] = useState('Dar es Salaam Dispatch Hub');
  const [notes, setNotes] = useState('');
  const [docUrl, setDocUrl] = useState('');
  const [otpInput, setOtpInput] = useState('');

  const loadShipments = useCallback(async () => {
    try {
      const res = await apiRequest<{ shipments: OpsShipment[] }>('/operations/shipments');
      setShipments(res.shipments);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load shipments', 'error');
    }
  }, [showToast]);

  useEffect(() => {
    if (user && (user.role === 'operations' || user.role === 'admin')) {
      void loadShipments();
    }
  }, [user, loadShipments]);

  if (!user || (user.role !== 'operations' && user.role !== 'admin')) {
    return (
      <main className="max-w-xl mx-auto px-4 py-14 text-center space-y-4">
        <p className="text-white text-lg font-semibold">Logistics Operations authorization required</p>
        <button type="button" onClick={() => navigate('auth')} className="px-5 py-2.5 rounded-md bg-[#F5B82E] text-[#050B18] text-sm font-semibold">
          Sign In as Operations Staff
        </button>
      </main>
    );
  }

  const handleUpdateMilestone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId) return;
    try {
      await apiRequest(`/operations/shipments/${selectedId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status,
          location,
          notes,
          shippingDocUrl: docUrl || undefined,
        }),
      });
      showToast('Shipment milestone recorded', 'success');
      setSelectedId(null);
      await loadShipments();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Update failed', 'error');
    }
  };

  const handleVerifyOtp = async (shipmentId: string) => {
    try {
      await apiRequest(`/operations/shipments/${shipmentId}/verify-otp`, {
        method: 'POST',
        body: JSON.stringify({ otpCode: otpInput }),
      });
      setOtpInput('');
      showToast('Delivery OTP verified! Escrow marked Verified.', 'success');
      await loadShipments();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'OTP verification failed', 'error');
    }
  };

  return (
    <main className="max-w-[1440px] mx-auto px-4 sm:px-8 py-10 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <p className="font-mono text-xs text-[#F5B82E]">Logistics & Operations Console</p>
          <h1 className="font-display text-3xl font-bold text-white mt-1">Assigned Shipments & Delivery OTP</h1>
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

      <div className="space-y-4">
        {shipments.map((s) => (
          <div key={s.id} className="p-5 rounded-xl bg-[#0B1426] border border-white/10 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-xs text-[#94A3B8]">
                  <span className="font-mono text-[#F5B82E] font-semibold">{s.order_number}</span>
                  <span>·</span>
                  <span className="font-mono text-white">{s.tracking_reference}</span>
                  <span>·</span>
                  <span>{s.corridor_code} ({s.incoterm})</span>
                  <span>·</span>
                  <span className="text-[#10B981] font-medium">{s.status}</span>
                </div>
                <p className="text-sm font-medium text-white">
                  {s.recipient_name} · {s.street_address}, {s.destination_zone} ({s.phone})
                </p>
                <p className="font-mono text-xs text-[#94A3B8] tabular-nums">
                  Value: {formatMoney(s.total_tzs, 'TZS')} / {formatMoney(s.total_usd_cents, 'USD')}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(s.id);
                    setDocUrl(s.shipping_doc_url || '');
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-[#F5B82E] text-[#050B18] text-xs font-semibold cursor-pointer"
                >
                  <Truck className="w-3.5 h-3.5" />
                  <span>Update Milestone</span>
                </button>

                {s.otp_verified ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-[#10B981]/50 text-[#10B981] text-xs font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>OTP Verified</span>
                  </span>
                ) : (
                  <div className="inline-flex items-center gap-1.5">
                    <input
                      value={otpInput}
                      onChange={(e) => setOtpInput(e.target.value)}
                      placeholder={`OTP (${s.otp_hint})`}
                      aria-label={`Enter OTP for ${s.order_number}`}
                      className="w-28 h-9 px-2.5 rounded bg-[#050B18] border border-white/15 text-xs font-mono text-white"
                    />
                    <button
                      type="button"
                      onClick={() => void handleVerifyOtp(s.id)}
                      className="inline-flex items-center gap-1 px-3 h-9 rounded bg-[#10B981] text-[#050B18] text-xs font-semibold cursor-pointer"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      <span>Verify OTP</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {selectedId === s.id && (
              <form onSubmit={handleUpdateMilestone} className="pt-4 border-t border-white/10 grid grid-cols-1 sm:grid-cols-4 gap-3">
                <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-10 px-3 rounded bg-[#050B18] border border-white/15 text-xs text-white">
                  {['Awaiting Packing', 'Packed', 'Inspected', 'Dispatched', 'In Transit', 'Delivered'].map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <input required value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Hub / Border Location" className="h-10 px-3 rounded bg-[#050B18] border border-white/15 text-xs text-white" />
                <input value={docUrl} onChange={(e) => setDocUrl(e.target.value)} placeholder="AWB / Manifest Doc Ref" className="h-10 px-3 rounded bg-[#050B18] border border-white/15 text-xs text-white" />
                <div className="flex gap-2">
                  <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" className="flex-1 h-10 px-3 rounded bg-[#050B18] border border-white/15 text-xs text-white" />
                  <button type="submit" className="px-4 h-10 rounded bg-[#F5B82E] text-[#050B18] text-xs font-semibold cursor-pointer">
                    Save
                  </button>
                </div>
              </form>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
