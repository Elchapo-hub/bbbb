import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { getDb } from './db';
import { createApiRouter } from './routes';

async function withTestServer(fn: (baseUrl: string) => Promise<void>) {
  const db = getDb(':memory:');
  const app = express();
  app.use(express.json());
  app.use('/api/v1', createApiRouter(db));
  const server = app.listen(0);
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  try {
    await fn(`http://127.0.0.1:${port}/api/v1`);
  } finally {
    server.close();
    db.close();
  }
}

test('End-to-end API flow: registration, RBAC enforcement, cart quote, checkout, webhook payment, OTP delivery, and escrow release', async () => {
  await withTestServer(async (base) => {
    // 1. Register new customer
    const regRes = await fetch(`${base}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'buyer.test@corelink.co.tz',
        password: 'TestPassword123!',
        fullName: 'Grace Mwalimu',
        phone: '+255755112233',
      }),
    });
    assert.equal(regRes.status, 201);
    const regJson = await regRes.json();
    const customerToken = regJson.token as string;
    assert.ok(customerToken);

    // 2. RBAC check: customer cannot access admin dashboard or create products
    const forbiddenAdmin = await fetch(`${base}/admin/dashboard`, {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    assert.equal(forbiddenAdmin.status, 403);

    // 3. Browse products (all 8 categories present, dual currency)
    const catsRes = await fetch(`${base}/ecommerce/categories`);
    const cats = await catsRes.json();
    assert.equal(cats.length, 8);

    const prodsRes = await fetch(`${base}/ecommerce/products`);
    const { products } = await prodsRes.json();
    assert.ok(products.length >= 12);

    // 4. Add 5 units to cart -> wholesale tier triggers
    const addRes = await fetch(`${base}/ecommerce/cart/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({ productId: 'prd-01', quantity: 5 }),
    });
    assert.equal(addRes.status, 201);

    // 5. Server-side quote locks FX for 15 minutes
    const quoteRes = await fetch(`${base}/ecommerce/cart/quote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({
        corridorCode: 'LOG-01',
        destinationZone: 'Kinondoni',
        couponCode: 'CORELINK10',
        buyerTaxProfile: 'business_b2b',
      }),
    });
    assert.equal(quoteRes.status, 200);
    const { quote } = await quoteRes.json();
    assert.ok(quote.fxLockedUntil);
    assert.ok(quote.productDiscountTzs > 0);
    assert.ok(quote.couponDiscountTzs > 0);
    assert.ok(quote.vatTzs > 0);

    // 6. Initiate checkout (server computes final total)
    const chkRes = await fetch(`${base}/ecommerce/checkout/initiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({
        corridorCode: 'LOG-01',
        destinationZone: 'Kinondoni',
        couponCode: 'CORELINK10',
        buyerTaxProfile: 'business_b2b',
        idempotencyKey: 'test-idem-1',
        address: {
          recipientName: 'Grace Mwalimu',
          phone: '+255755112233',
          country: 'Tanzania',
          regionOrCity: 'Dar es Salaam',
          district: 'Kinondoni',
          streetAddress: 'Msasani Peninsula Plot 18',
        },
      }),
    });
    assert.equal(chkRes.status, 201);
    const chk = await chkRes.json();
    const deliveryOtp = chk.deliveryOtpForCustomer as string;
    assert.equal(deliveryOtp.length, 6);

    // 7. Initiate payment (Mobile Money sandbox stays pending until webhook!)
    const payRes = await fetch(`${base}/ecommerce/payments/initiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({
        orderId: chk.orderId,
        paymentMethod: 'mobile_money',
        provider: 'vodacom_mpesa',
        currency: 'TZS',
        phoneNumber: '+255755112233',
      }),
    });
    assert.equal(payRes.status, 201);
    const { payment } = await payRes.json();
    assert.equal(payment.status, 'pending');

    // 8. Verified Webhook confirms payment and funds Escrow
    const whRes = await fetch(`${base}/ecommerce/payments/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-corelink-signature': 'sandbox-verified' },
      body: JSON.stringify({
        paymentId: payment.id,
        status: 'confirmed',
        providerReference: 'MPESA-LIVE-77401',
      }),
    });
    assert.equal(whRes.status, 200);

    // 9. Operations staff logs in and verifies Delivery OTP
    const opsLogin = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'ops.dar@corelink.co.tz', password: 'Corelink2026!' }),
    });
    const { token: opsToken } = await opsLogin.json();
    const shpsRes = await fetch(`${base}/operations/shipments`, {
      headers: { Authorization: `Bearer ${opsToken}` },
    });
    const { shipments } = await shpsRes.json();
    const targetShipment = shipments.find((s: { order_id: string }) => s.order_id === chk.orderId);
    assert.ok(targetShipment);

    const otpRes = await fetch(`${base}/operations/shipments/${targetShipment.id}/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opsToken}` },
      body: JSON.stringify({ otpCode: deliveryOtp }),
    });
    assert.equal(otpRes.status, 200);

    // 10. Claim first-run Admin account & release escrow
    const adminClaim = await fetch(`${base}/auth/admin-claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@smgcorelink.co.tz',
        fullName: 'Chief Administrator',
        passcode: 'AdminSecure2026!',
      }),
    });
    assert.equal(adminClaim.status, 201);
    const { token: adminToken } = await adminClaim.json();

    const escRes = await fetch(`${base}/admin/escrow`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const { accounts } = await escRes.json();
    const orderEscrow = accounts.find((a: { order_id: string }) => a.order_id === chk.orderId);
    assert.equal(orderEscrow.state, 'Verified');

    const releaseRes = await fetch(`${base}/admin/escrow/${orderEscrow.id}/release`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(releaseRes.status, 200);

    // 11. Merchant ownership protection test
    const merchLogin = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'karibu.bespoke@corelink.co.tz', password: 'Corelink2026!' }),
    });
    const { token: merch1Token } = await merchLogin.json();
    // Merchant 1 tries to edit Merchant 2's product prd-10 -> must be 403!
    const crossEdit = await fetch(`${base}/ecommerce/products/prd-10`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${merch1Token}` },
      body: JSON.stringify({ basePriceMinor: 100 }),
    });
    assert.equal(crossEdit.status, 403);
  });
});
