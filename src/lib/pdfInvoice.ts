import { jsPDF } from 'jspdf';
import { formatMoney } from './finance';

export interface InvoiceDocumentPayload {
  order: {
    order_number: string;
    corridor_code: string;
    incoterm: string;
    destination_zone: string;
    locked_fx_rate: number;
    status: string;
    created_at: string;
  };
  invoice: {
    invoice_number: string;
    invoice_type: string;
    issued_at: string;
  };
  items: Array<{
    product_name: string;
    sku: string;
    quantity: number;
    unit_price_tzs: number;
    unit_price_usd_cents: number;
    product_discount_tzs: number;
    line_total_tzs: number;
    line_total_usd_cents: number;
  }>;
  calculation: {
    gross_subtotal_tzs: number;
    gross_subtotal_usd_cents: number;
    product_discount_tzs: number;
    product_discount_usd_cents: number;
    coupon_code: string | null;
    coupon_discount_tzs: number;
    coupon_discount_usd_cents: number;
    shipping_fee_tzs: number;
    shipping_fee_usd_cents: number;
    insurance_fee_tzs: number;
    insurance_fee_usd_cents: number;
    tax_rule_code: string;
    tax_rate_bps: number;
    vat_tzs: number;
    vat_usd_cents: number;
    final_total_tzs: number;
    final_total_usd_cents: number;
  };
  address: {
    recipient_name: string;
    phone: string;
    country: string;
    region_or_city: string;
    district: string;
    street_address: string;
  } | null;
  merchant: {
    business_name: string;
    tin_number: string;
    city: string;
    country: string;
  };
  buyer: {
    full_name: string;
    email: string;
    phone: string;
    tin_number?: string;
  };
  fiscalNotice?: string;
}

export function downloadOrderInvoicePdf(
  payload: InvoiceDocumentPayload,
  docLabel: 'Customer Invoice' | 'Commercial Invoice' | 'Payment Receipt' | 'Order Summary' = 'Customer Invoice'
) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const { order, invoice, items, calculation, address, merchant, buyer } = payload;

  // Header Banner
  doc.setFillColor(5, 11, 24);
  doc.rect(0, 0, 595, 92, 'F');
  doc.setTextColor(245, 184, 46);
  doc.setFontSize(18);
  doc.text('SMG CORELINK', 40, 40);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.text(`Tanzanian Domestic & International Commerce · ${docLabel.toUpperCase()}`, 40, 60);
  doc.text(`Invoice #: ${invoice?.invoice_number || `INV-${order.order_number}`}`, 390, 38);
  doc.text(`Order #: ${order.order_number}`, 390, 54);
  doc.text(`Date: ${new Date(invoice?.issued_at || order.created_at).toLocaleDateString('en-GB')}`, 390, 70);

  // Seller & Buyer Blocks
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(9);
  let y = 120;
  doc.setFont('helvetica', 'bold');
  doc.text('SELLER / VERIFIED MERCHANT', 40, y);
  doc.text('BUYER / CONSIGNEE', 310, y);
  doc.setFont('helvetica', 'normal');
  y += 16;
  doc.text(merchant?.business_name || 'SMG Corelink Verified Merchant', 40, y);
  doc.text(buyer?.full_name || address?.recipient_name || 'Customer', 310, y);
  y += 14;
  doc.text(`TIN: ${merchant?.tin_number || 'N/A'} · ${merchant?.city || 'Dar es Salaam'}, ${merchant?.country || 'Tanzania'}`, 40, y);
  doc.text(`${buyer?.email || ''} · ${buyer?.phone || address?.phone || ''}`, 310, y);
  y += 14;
  doc.text(`Corridor: ${order.corridor_code} (${order.incoterm}) -> ${order.destination_zone}`, 40, y);
  if (address) {
    doc.text(`${address.street_address}, ${address.district}, ${address.region_or_city}, ${address.country}`, 310, y, { maxWidth: 245 });
  }

  // Locked FX Banner
  y += 32;
  doc.setFillColor(241, 245, 249);
  doc.rect(40, y, 515, 24, 'F');
  doc.setFont('helvetica', 'bold');
  doc.text(`Locked FX Rate: 1 USD = ${order.locked_fx_rate.toLocaleString('en-US')} TZS · Status: ${order.status}`, 50, y + 15);

  // Line Items Table
  y += 42;
  doc.setFillColor(11, 20, 38);
  doc.rect(40, y, 515, 22, 'F');
  doc.setTextColor(255, 255, 255);
  doc.text('Item / SKU', 48, y + 14);
  doc.text('Qty', 280, y + 14);
  doc.text('Unit (TZS / USD)', 325, y + 14);
  doc.text('Line Total', 455, y + 14);

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'normal');
  y += 34;

  for (const item of items) {
    doc.text(`${item.product_name.slice(0, 40)} (${item.sku})`, 48, y);
    doc.text(String(item.quantity), 285, y);
    doc.text(`${formatMoney(item.unit_price_tzs, 'TZS')} / ${formatMoney(item.unit_price_usd_cents, 'USD')}`, 325, y);
    doc.text(`${formatMoney(item.line_total_tzs, 'TZS')}`, 455, y);
    y += 18;
  }

  // Totals Summary
  y += 16;
  doc.setDrawColor(203, 213, 225);
  doc.line(300, y, 555, y);
  y += 18;

  const rows: Array<[string, string, string]> = [
    ['Gross Product Subtotal', formatMoney(calculation.gross_subtotal_tzs, 'TZS'), formatMoney(calculation.gross_subtotal_usd_cents, 'USD')],
    ['Product / Wholesale Discount', `-${formatMoney(calculation.product_discount_tzs, 'TZS')}`, `-${formatMoney(calculation.product_discount_usd_cents, 'USD')}`],
    [
      `Coupon${calculation.coupon_code ? ` (${calculation.coupon_code})` : ''}`,
      `-${formatMoney(calculation.coupon_discount_tzs, 'TZS')}`,
      `-${formatMoney(calculation.coupon_discount_usd_cents, 'USD')}`,
    ],
    ['Logistics & Shipping', formatMoney(calculation.shipping_fee_tzs, 'TZS'), formatMoney(calculation.shipping_fee_usd_cents, 'USD')],
    ['Cargo Insurance', formatMoney(calculation.insurance_fee_tzs, 'TZS'), formatMoney(calculation.insurance_fee_usd_cents, 'USD')],
    [
      `VAT (${calculation.tax_rule_code} · ${(calculation.tax_rate_bps / 100).toFixed(1)}%)`,
      formatMoney(calculation.vat_tzs, 'TZS'),
      formatMoney(calculation.vat_usd_cents, 'USD'),
    ],
  ];

  for (const [label, tzs, usd] of rows) {
    doc.text(label, 250, y);
    doc.text(tzs, 405, y);
    doc.text(usd, 500, y);
    y += 16;
  }

  y += 6;
  doc.setFillColor(5, 11, 24);
  doc.rect(240, y, 315, 28, 'F');
  doc.setTextColor(245, 184, 46);
  doc.setFont('helvetica', 'bold');
  doc.text('FINAL ORDER TOTAL', 250, y + 18);
  doc.setTextColor(255, 255, 255);
  doc.text(formatMoney(calculation.final_total_tzs, 'TZS'), 395, y + 18);
  doc.text(formatMoney(calculation.final_total_usd_cents, 'USD'), 495, y + 18);

  // TRA EFD Legal Compliance Disclaimer
  y += 52;
  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(
    payload.fiscalNotice ||
      'NOTICE: This PDF is a commercial order summary/invoice generated by SMG Corelink. Official statutory fiscal receipts are issued solely through an approved TRA EFD integration.',
    40,
    y,
    { maxWidth: 515 }
  );

  doc.save(`${docLabel.replace(/\s+/g, '_')}_${order.order_number}.pdf`);
}
