import React, { useEffect, useState } from 'react';
import { CheckCircle2, FileDown, Package, Search, Truck } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { apiRequest } from '../lib/api';
import { downloadOrderInvoicePdf, type InvoiceDocumentPayload } from '../lib/pdfInvoice';

interface TrackingResponse {
  order: {
    id: string;
    order_number: string;
    status: string;
    corridor_code: string;
    incoterm: string;
    destination_zone: string;
    created_at: string;
  };
  shipment: {
    id: string;
    tracking_reference: string;
    status: string;
    packed_inspected: number;
    shipping_doc_url: string | null;
    updated_at: string;
  } | null;
  events: Array<{
    id: string;
    milestone: string;
    location: string;
    notes: string;
    created_at: string;
  }>;
  otp: {
    otp_hint: string;
    verified: number;
    verified_at: string | null;
  } | null;
}

export function TrackingPage({ initialRef }: { initialRef?: string }) {
  const { user, showToast } = useStore();
  const [query, setQuery] = useState(initialRef || 'SMG-2026-1002');
  const [data, setData] = useState<TrackingResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const lookup = async (target: string) => {
    if (!target.trim()) return;
    setLoading(true);
    try {
      const res = await apiRequest<TrackingResponse>(`/ecommerce/orders/${encodeURIComponent(target.trim())}/tracking`);
      setData(res);
    } catch (err) {
      setData(null);
      showToast(err instanceof Error ? err.message : 'Order not found', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void lookup(query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRef]);

  const handleDownloadInvoice = async () => {
    if (!data) return;
    if (!user) {
      showToast('Sign in as the order owner or admin to download PDF invoice', 'info');
      return;
    }
    try {
      const inv = await apiRequest<InvoiceDocumentPayload>(`/ecommerce/orders/${data.order.id}/invoice`);
      downloadOrderInvoicePdf(inv, data.order.corridor_code === 'LOG-03' || data.order.corridor_code === 'LOG-04' ? 'Commercial Invoice' : 'Customer Invoice');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Cannot download invoice', 'error');
    }
  };

  const milestoneSteps = ['Order Placed', 'Packed', 'Inspected', 'Dispatched', 'In Transit', 'Delivered'];

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-8 py-10 space-y-8">
      <div className="border-b border-white/10 pb-5">
        <h1 className="font-display text-3xl font-bold text-white">Order & Shipment Tracking</h1>
        <p className="text-sm text-[#94A3B8] mt-1">
          Enter your SMG Corelink order number (try <span className="font-mono text-white">SMG-2026-1002</span> or <span className="font-mono text-white">SMG-2026-1001</span>).
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void lookup(query);
        }}
        className="flex flex-col sm:flex-row gap-3"
      >
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[#94A3B8] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Order # (e.g. SMG-2026-1002)"
            aria-label="Order number for tracking"
            className="w-full h-11 pl-10 pr-4 rounded-md bg-[#0B1426] border border-white/15 text-sm font-mono text-white"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="px-6 h-11 rounded-md bg-[#F5B82E] text-[#050B18] text-sm font-semibold cursor-pointer"
        >
          {loading ? 'Searching...' : 'Track Shipment'}
        </button>
      </form>

      {data && (
        <div className="bg-[#0B1426] border border-white/10 rounded-xl p-6 sm:p-8 space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
            <div>
              <p className="font-mono text-xs text-[#F5B82E]">
                {data.order.order_number} · {data.order.corridor_code} ({data.order.incoterm})
              </p>
              <h2 className="font-display text-2xl font-bold text-white mt-1">
                Status: {data.shipment?.status || data.order.status}
              </h2>
              <p className="text-xs text-[#94A3B8] mt-1">
                Tracking Ref: <span className="font-mono text-white">{data.shipment?.tracking_reference}</span> · Destination: {data.order.destination_zone}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleDownloadInvoice()}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md border border-[#F5B82E] text-[#F5B82E] hover:bg-[#F5B82E] hover:text-[#050B18] text-xs font-semibold transition-colors cursor-pointer"
            >
              <FileDown className="w-4 h-4" />
              <span>Download PDF Invoice</span>
            </button>
          </div>

          {/* Visual Milestone Progress */}
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
            {milestoneSteps.map((step, idx) => {
              const currentIdx = milestoneSteps.findIndex((s) =>
                (data.shipment?.status || data.order.status).toLowerCase().includes(s.toLowerCase())
              );
              const reached = currentIdx >= idx || data.order.status === 'Completed' || data.order.status === 'Delivered';
              return (
                <div
                  key={step}
                  className={`p-3 rounded-lg border text-center ${
                    reached ? 'border-[#10B981]/50 bg-[#10B981]/10' : 'border-white/10 bg-[#050B18]'
                  }`}
                >
                  {reached ? (
                    <CheckCircle2 className="w-4 h-4 text-[#10B981] mx-auto mb-1" />
                  ) : idx < 3 ? (
                    <Package className="w-4 h-4 text-[#94A3B8] mx-auto mb-1" />
                  ) : (
                    <Truck className="w-4 h-4 text-[#94A3B8] mx-auto mb-1" />
                  )}
                  <p className={`text-xs font-medium ${reached ? 'text-white' : 'text-[#94A3B8]'}`}>{step}</p>
                </div>
              );
            })}
          </div>

          {data.otp && (
            <div className="p-4 rounded-lg bg-[#050B18] border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <span className="text-[#94A3B8]">
                Delivery OTP Security Check (Hint: <strong className="font-mono text-white">{data.otp.otp_hint}</strong>)
              </span>
              <span className={data.otp.verified ? 'text-[#10B981] font-semibold' : 'text-[#F5B82E] font-semibold'}>
                {data.otp.verified
                  ? `OTP Verified on ${new Date(data.otp.verified_at || '').toLocaleString()}`
                  : 'Awaiting recipient OTP handover verification'}
              </span>
            </div>
          )}

          {/* Chronological Events */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-white">Shipment Milestone Timeline</h3>
            <div className="space-y-3">
              {data.events.map((ev) => (
                <div key={ev.id} className="p-4 rounded-lg bg-[#050B18] border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-white">{ev.milestone}</p>
                    <p className="text-xs text-[#94A3B8]">{ev.location}{ev.notes ? ` · ${ev.notes}` : ''}</p>
                  </div>
                  <span className="font-mono text-xs text-[#94A3B8] tabular-nums shrink-0">
                    {new Date(ev.created_at).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export function StaticInfoPage({
  page,
}: {
  page: 'about' | 'contact' | 'help' | 'terms' | 'privacy';
}) {
  const { showToast } = useStore();
  const [contactSent, setContactSent] = useState(false);

  const contentMap = {
    about: {
      title: 'About SMG Corelink',
      subtitle: 'Tanzanian Domestic & Cross-Border Trade Infrastructure',
      paragraphs: [
        'SMG Corelink connects verified Tanzanian manufacturers, executive fashion ateliers, authorized mobile distributors, and industrial electrical suppliers with retail buyers and international procurement teams.',
        'Every order operates on a transparent dual-currency TZS/USD calculation engine with 15-minute checkout FX locking, server-validated VAT and wholesale volume rules, and milestone-based escrow accounting.',
      ],
    },
    help: {
      title: 'Help & Support Centre',
      subtitle: 'Guidance on Logistics Corridors, Milestone Escrow, and Delivery OTPs',
      paragraphs: [
        'Dar Express (LOG-01) delivers within Kinondoni, Ilala, Temeke, Ubungo, and Kigamboni in 2–6 hours under DDP terms. Upcountry Tanzania (LOG-02) reaches Arusha, Mwanza, Dodoma, Mbeya, Tanga, Mtwara, and Zanzibar in 1–3 business days.',
        'For domestic deliveries, recipients must share their 6-digit Delivery OTP with the Corelink courier upon physical inspection. International EAC/SADC (LOG-03) and Global Export (LOG-04) shipments release escrow upon verified shipping/customs documentation.',
      ],
    },
    terms: {
      title: 'Terms & Conditions',
      subtitle: 'Commercial Trading, Escrow Accounting, and Tax Compliance Terms',
      paragraphs: [
        'All prices, discounts, shipping calculations, and VAT rates displayed at checkout are calculated authoritatively on SMG Corelink servers. Locked checkout exchange rates remain valid for 15 minutes from quote generation.',
        'Corelink Milestone Escrow operates as an operational payment ledger; regulated settlement is executed through authorised financial partners. Commercial PDF invoices do not replace statutory TRA Electronic Fiscal Device (EFD) receipts.',
      ],
    },
    privacy: {
      title: 'Privacy Policy',
      subtitle: 'Data Protection for Buyers, Merchants, and Logistics Partners',
      paragraphs: [
        'SMG Corelink stores only the personal, business registration (BRELA/TIN), and shipping records required to process orders, satisfy Tanzanian tax and customs compliance, and deliver shipments.',
        'Raw payment card credentials are never collected or stored on SMG Corelink servers. Sensitive merchant verification documents are restricted to private storage and authorised compliance administrators.',
      ],
    },
    contact: {
      title: 'Contact SMG Corelink Trade Desk',
      subtitle: 'Ohio Street, Ilala, Dar es Salaam · +255 22 211 8400 · trade@smgcorelink.co.tz',
      paragraphs: [],
    },
  };

  const info = contentMap[page];

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-8 py-12 space-y-8">
      <div className="border-b border-white/10 pb-5">
        <h1 className="font-display text-3xl font-bold text-white">{info.title}</h1>
        <p className="text-sm text-[#F5B82E] mt-1">{info.subtitle}</p>
      </div>

      {info.paragraphs.map((p, i) => (
        <p key={i} className="text-sm text-[#94A3B8] leading-relaxed">
          {p}
        </p>
      ))}

      {page === 'contact' && (
        <div className="bg-[#0B1426] border border-white/10 rounded-xl p-6 sm:p-8">
          {contactSent ? (
            <p className="text-sm text-[#10B981] font-medium">
              Your inquiry has been logged with the Dar es Salaam Trade Desk. A specialist will reply within 1 business day.
            </p>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setContactSent(true);
                showToast('Inquiry submitted to Trade Desk', 'success');
              }}
              className="space-y-4"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="c-name" className="block text-xs text-[#94A3B8] mb-1">Full Name</label>
                  <input id="c-name" required className="w-full h-10 px-3 rounded-md bg-[#050B18] border border-white/15 text-sm text-white" />
                </div>
                <div>
                  <label htmlFor="c-email" className="block text-xs text-[#94A3B8] mb-1">Email Address</label>
                  <input id="c-email" type="email" required className="w-full h-10 px-3 rounded-md bg-[#050B18] border border-white/15 text-sm text-white" />
                </div>
              </div>
              <div>
                <label htmlFor="c-msg" className="block text-xs text-[#94A3B8] mb-1">Trade / Support Message</label>
                <textarea id="c-msg" rows={4} required className="w-full p-3 rounded-md bg-[#050B18] border border-white/15 text-sm text-white" />
              </div>
              <button type="submit" className="px-6 py-2.5 rounded-md bg-[#F5B82E] text-[#050B18] text-sm font-semibold cursor-pointer">
                Send Message
              </button>
            </form>
          )}
        </div>
      )}
    </main>
  );
}
