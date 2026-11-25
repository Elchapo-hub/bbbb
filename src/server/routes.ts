import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import express, { type Request, type Response } from 'express';
import { z } from 'zod';
import {
  calculateCheckoutQuote,
  computeEffectiveRateScaled,
  convertCurrencyMinor,
  effectiveRateScaledToNumber,
} from '../lib/finance';
import type {
  CorridorCode,
  CouponRecord,
  CurrencyCode,
  Product,
  ProductPromotion,
  ProductVariant,
  ShippingCorridor,
  TaxRule,
  UserRole,
  WholesaleTier,
} from '../lib/types';
import { optionalAuth, requireAuth, requireRole, signSessionToken, type AuthedRequest } from './auth';
import { hashPassword, verifyPassword } from './db';
import { initiateUnifiedPayment, verifyWebhookSignature } from './paymentAdapters';

function uid(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 12)}`;
}

function logAudit(
  db: Database.Database,
  actorId: string | null,
  action: string,
  entityType: string,
  entityId: string,
  details: Record<string, unknown> = {}
) {
  db.prepare(
    'INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, details_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(uid('aud'), actorId, action, entityType, entityId, JSON.stringify(details), new Date().toISOString());
}

function createNotification(
  db: Database.Database,
  userId: string,
  title: string,
  message: string,
  channel = 'in_app'
) {
  db.prepare(
    'INSERT INTO notifications (id, user_id, channel, title, message, is_read, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)'
  ).run(uid('ntf'), userId, channel, title, message, new Date().toISOString());
}

function getActiveFx(db: Database.Database) {
  const row = db
    .prepare('SELECT * FROM exchange_rates WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1')
    .get() as
    | {
        id: string;
        base_currency: 'USD';
        quote_currency: 'TZS';
        mid_rate: number;
        spread_bps: number;
        effective_rate: number;
        source: string;
        is_fallback: number;
        created_at: string;
      }
    | undefined;
  if (!row) {
    return {
      id: 'fx-fallback',
      baseCurrency: 'USD' as const,
      quoteCurrency: 'TZS' as const,
      midRate: 2680,
      spreadBps: 120,
      effectiveRate: 2712.16,
      source: 'Fallback Reference',
      isFallback: true,
      updatedAt: new Date().toISOString(),
    };
  }
  return {
    id: row.id,
    baseCurrency: row.base_currency,
    quoteCurrency: row.quote_currency,
    midRate: row.mid_rate,
    spreadBps: row.spread_bps,
    effectiveRate: row.effective_rate,
    source: row.source,
    isFallback: Boolean(row.is_fallback),
    updatedAt: row.created_at,
  };
}

function getTaxRules(db: Database.Database): TaxRule[] {
  const row = db.prepare('SELECT value_json FROM platform_settings WHERE key = ?').get('tax_rules') as
    | { value_json: string }
    | undefined;
  if (!row) return [];
  return JSON.parse(row.value_json) as TaxRule[];
}

function getCorridors(db: Database.Database): ShippingCorridor[] {
  const rows = db
    .prepare(
      `SELECT c.*, r.base_currency, r.base_rate_minor, r.included_weight_kg, r.per_kg_rate_minor, r.sea_lcl_per_cbm_usd_cents, r.sea_fcl_20ft_usd_cents, r.insurance_rate_bps
       FROM shipping_corridors c
       JOIN shipping_rates r ON r.corridor_id = c.id
       ORDER BY c.code ASC`
    )
    .all() as Array<{
    id: string;
    code: CorridorCode;
    name: string;
    incoterm: string;
    coverage_zones_json: string;
    estimated_delivery: string;
    is_export: number;
    active: number;
    base_currency: CurrencyCode;
    base_rate_minor: number;
    included_weight_kg: number;
    per_kg_rate_minor: number;
    sea_lcl_per_cbm_usd_cents: number;
    sea_fcl_20ft_usd_cents: number;
    insurance_rate_bps: number;
  }>;

  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    incoterm: r.incoterm,
    coverageZones: JSON.parse(r.coverage_zones_json) as string[],
    baseCurrency: r.base_currency,
    baseRateMinor: r.base_rate_minor,
    includedWeightKg: r.included_weight_kg,
    perKgRateMinor: r.per_kg_rate_minor,
    seaLclPerCbmUsdCents: r.sea_lcl_per_cbm_usd_cents,
    seaFcl20ftUsdCents: r.sea_fcl_20ft_usd_cents,
    insuranceRateBps: r.insurance_rate_bps,
    estimatedDelivery: r.estimated_delivery,
    isExport: Boolean(r.is_export),
    active: Boolean(r.active),
  }));
}

function hydrateProducts(db: Database.Database, whereClause = 'WHERE p.is_active = 1', params: unknown[] = []): Product[] {
  const fx = getActiveFx(db);
  const fxScaled = computeEffectiveRateScaled(fx.midRate, fx.spreadBps);

  const rows = db
    .prepare(
      `SELECT p.*, c.code as category_code, c.name as category_name,
              m.business_name as merchant_name, m.verification_status as merchant_status,
              inv.stock_qty, inv.low_stock_threshold, pa.attributes_json
       FROM products p
       JOIN categories c ON c.id = p.category_id
       JOIN merchants m ON m.id = p.merchant_id
       LEFT JOIN inventory inv ON inv.product_id = p.id
       LEFT JOIN product_attributes pa ON pa.product_id = p.id
       ${whereClause}
       ORDER BY p.is_featured DESC, p.created_at DESC`
    )
    .all(...params) as Array<{
    id: string;
    merchant_id: string;
    merchant_name: string;
    merchant_status: string;
    category_id: string;
    category_code: string;
    category_name: string;
    sku: string;
    name: string;
    slug: string;
    subtype: string;
    description: string;
    base_price_minor: number;
    base_currency: CurrencyCode;
    weight_kg: number;
    length_cm: number;
    width_cm: number;
    height_cm: number;
    stock_qty: number | null;
    low_stock_threshold: number | null;
    is_featured: number;
    is_new_arrival: number;
    is_best_seller: number;
    is_active: number;
    attributes_json: string | null;
    created_at: string;
  }>;

  if (rows.length === 0) return [];

  const imgStmt = db.prepare('SELECT image_url FROM product_images WHERE product_id = ? ORDER BY sort_order ASC');
  const varStmt = db.prepare('SELECT * FROM product_variants WHERE product_id = ?');
  const ruleStmt = db.prepare('SELECT * FROM discount_rules WHERE product_id = ? AND active = 1');
  const revStmt = db.prepare('SELECT AVG(rating) as avg_rating, COUNT(*) as cnt FROM reviews WHERE product_id = ?');

  return rows.map((r) => {
    const imgs = (imgStmt.all(r.id) as Array<{ image_url: string }>).map((x) => x.image_url);
    const varRows = varStmt.all(r.id) as Array<{
      id: string;
      sku: string;
      name: string;
      stock_qty: number;
      price_delta_minor: number;
      attributes_json: string;
    }>;
    const variants: ProductVariant[] = varRows.map((v) => ({
      id: v.id,
      sku: v.sku,
      name: v.name,
      stockQty: v.stock_qty,
      priceDeltaMinor: v.price_delta_minor,
      attributes: JSON.parse(v.attributes_json || '{}'),
    }));

    const rules = ruleStmt.all(r.id) as Array<{
      id: string;
      rule_kind: string;
      min_qty: number;
      discount_type: 'percentage' | 'fixed';
      discount_value: number;
      starts_at: string | null;
      ends_at: string | null;
      active: number;
    }>;

    const wholesaleTiers: WholesaleTier[] = rules
      .filter((ru) => ru.rule_kind === 'wholesale_tier')
      .map((ru) => ({ minQty: ru.min_qty, discountPercent: ru.discount_value }))
      .sort((a, b) => a.minQty - b.minQty);

    const promoRow = rules.find((ru) => ru.rule_kind === 'promotion');
    const promotion: ProductPromotion | null = promoRow
      ? {
          id: promoRow.id,
          type: promoRow.discount_type,
          value: promoRow.discount_value,
          active: Boolean(promoRow.active),
          startsAt: promoRow.starts_at ?? undefined,
          endsAt: promoRow.ends_at ?? undefined,
        }
      : null;

    const rev = revStmt.get(r.id) as { avg_rating: number | null; cnt: number };
    const targetCurrency: CurrencyCode = r.base_currency === 'USD' ? 'TZS' : 'USD';
    const convertedPriceMinor = convertCurrencyMinor(r.base_price_minor, r.base_currency, targetCurrency, fxScaled);

    return {
      id: r.id,
      merchantId: r.merchant_id,
      merchantName: r.merchant_name,
      merchantVerified: r.merchant_status === 'approved',
      categoryId: r.category_id,
      categoryCode: r.category_code,
      categoryName: r.category_name,
      sku: r.sku,
      name: r.name,
      slug: r.slug,
      subtype: r.subtype,
      description: r.description,
      basePriceMinor: r.base_price_minor,
      baseCurrency: r.base_currency,
      convertedPriceMinor,
      lastFxUpdateAt: fx.updatedAt,
      weightKg: r.weight_kg,
      lengthCm: r.length_cm,
      widthCm: r.width_cm,
      heightCm: r.height_cm,
      stockQty: r.stock_qty ?? 0,
      lowStockThreshold: r.low_stock_threshold ?? 5,
      isFeatured: Boolean(r.is_featured),
      isNewArrival: Boolean(r.is_new_arrival),
      isBestSeller: Boolean(r.is_best_seller),
      isActive: Boolean(r.is_active),
      images: imgs.length > 0 ? imgs : ['/src/assets/images/hero_corelink_commerce_1795560174816.jpg'],
      attributes: JSON.parse(r.attributes_json || '{}'),
      variants,
      wholesaleTiers,
      promotion,
      ratingAvg: rev?.avg_rating ? Number(rev.avg_rating.toFixed(1)) : 4.8,
      reviewCount: rev?.cnt ?? 0,
      createdAt: r.created_at,
    };
  });
}

function getOrCreateCart(db: Database.Database, userId: string | undefined, sessionToken: string | undefined) {
  const now = new Date().toISOString();
  if (userId) {
    let cart = db.prepare('SELECT * FROM carts WHERE user_id = ?').get(userId) as
      | { id: string; locked_fx_mid_rate: number | null; locked_fx_spread_bps: number | null; fx_locked_until: string | null }
      | undefined;
    if (!cart) {
      const id = uid('crt');
      db.prepare('INSERT INTO carts (id, user_id, created_at, updated_at) VALUES (?, ?, ?, ?)').run(id, userId, now, now);
      cart = { id, locked_fx_mid_rate: null, locked_fx_spread_bps: null, fx_locked_until: null };
    }
    return cart;
  }

  const token = sessionToken || 'anon-default';
  let cart = db.prepare('SELECT * FROM carts WHERE session_token = ?').get(token) as
    | { id: string; locked_fx_mid_rate: number | null; locked_fx_spread_bps: number | null; fx_locked_until: string | null }
    | undefined;
  if (!cart) {
    const id = uid('crt');
    db.prepare('INSERT INTO carts (id, session_token, created_at, updated_at) VALUES (?, ?, ?, ?)').run(id, token, now, now);
    cart = { id, locked_fx_mid_rate: null, locked_fx_spread_bps: null, fx_locked_until: null };
  }
  return cart;
}

function getHydratedCartItems(db: Database.Database, cartId: string) {
  const rows = db
    .prepare('SELECT * FROM cart_items WHERE cart_id = ? ORDER BY created_at ASC')
    .all(cartId) as Array<{ id: string; product_id: string; variant_id: string | null; quantity: number }>;

  if (rows.length === 0) return [];
  const allProducts = hydrateProducts(db, 'WHERE p.is_active = 1');
  const map = new Map(allProducts.map((p) => [p.id, p]));

  return rows
    .map((ci) => {
      const product = map.get(ci.product_id);
      if (!product) return null;
      const variant = ci.variant_id ? product.variants.find((v) => v.id === ci.variant_id) ?? null : null;
      const unitBaseMinor = Math.max(0, product.basePriceMinor + (variant?.priceDeltaMinor ?? 0));
      return {
        id: ci.id,
        productId: ci.product_id,
        variantId: ci.variant_id,
        variantName: variant?.name ?? null,
        quantity: ci.quantity,
        product: {
          ...product,
          basePriceMinor: unitBaseMinor,
        },
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}

// Simple per-IP rate limiter for sensitive auth/payment routes
const rateHits = new Map<string, { count: number; resetAt: number }>();
function rateLimit(maxHits = 60, windowMs = 60_000) {
  return (req: Request, res: Response, next: express.NextFunction) => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    const rec = rateHits.get(key);
    if (!rec || rec.resetAt < now) {
      rateHits.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    if (rec.count >= maxHits) {
      res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' });
      return;
    }
    rec.count += 1;
    next();
  };
}

export function createApiRouter(db: Database.Database) {
  const router = express.Router();
  router.use(optionalAuth);

  // =========================================================
  // 1. AUTHENTICATION & PROFILES
  // =========================================================
  router.get('/auth/admin-status', (_req, res) => {
    const adminRow = db
      .prepare("SELECT p.id, p.email FROM profiles p JOIN user_roles ur ON ur.user_id = p.id WHERE ur.role = 'admin' LIMIT 1")
      .get() as { id: string; email: string } | undefined;
    const envPassSet = Boolean(process.env.ADMIN_BOOTSTRAP_PASSCODE && process.env.ADMIN_BOOTSTRAP_PASSCODE.length >= 6);
    const claimedRow = db.prepare('SELECT value_json FROM platform_settings WHERE key = ?').get('admin_passcode_hash') as
      | { value_json: string }
      | undefined;
    res.json({
      hasAdminAccount: Boolean(adminRow),
      needsBootstrap: !envPassSet && !claimedRow && !adminRow,
      usesEnvPasscode: envPassSet,
    });
  });

  router.post('/auth/admin-claim', rateLimit(20), (req, res) => {
    const schema = z.object({
      email: z.string().email().default('admin@smgcorelink.co.tz'),
      fullName: z.string().min(2).max(100).default('SMG Platform Administrator'),
      passcode: z.string().min(6).max(128),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Valid email and passcode (minimum 6 characters) are required.' });
      return;
    }

    const { email, fullName, passcode } = parsed.data;
    const envPass = process.env.ADMIN_BOOTSTRAP_PASSCODE;
    const now = new Date().toISOString();

    if (envPass && envPass.length >= 6) {
      if (passcode !== envPass) {
        res.status(401).json({ error: 'Invalid administrator passcode.' });
        return;
      }
      let admin = db.prepare('SELECT * FROM profiles WHERE email = ?').get(email.toLowerCase()) as
        | { id: string; email: string; full_name: string; phone: string; preferred_currency: CurrencyCode; tax_profile: string; status: string }
        | undefined;
      if (!admin) {
        const id = uid('adm');
        db.prepare(
          'INSERT INTO profiles (id, email, full_name, phone, password_hash, email_verified, preferred_currency, tax_profile, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)'
        ).run(id, email.toLowerCase(), fullName, '+255 22 211 8400', hashPassword(passcode), 'USD', 'business_b2b', 'active', now, now);
        db.prepare('INSERT INTO user_roles (id, user_id, role, created_at) VALUES (?, ?, ?, ?)').run(uid('role'), id, 'admin', now);
        admin = db.prepare('SELECT * FROM profiles WHERE id = ?').get(id) as typeof admin;
      }
      const token = signSessionToken({ userId: admin!.id, email: admin!.email, role: 'admin' });
      res.json({
        token,
        user: {
          id: admin!.id,
          email: admin!.email,
          fullName: admin!.full_name,
          role: 'admin',
          emailVerified: true,
          preferredCurrency: admin!.preferred_currency,
          taxProfile: admin!.tax_profile,
        },
      });
      return;
    }

    const existingClaim = db.prepare('SELECT value_json FROM platform_settings WHERE key = ?').get('admin_passcode_hash') as
      | { value_json: string }
      | undefined;

    if (existingClaim) {
      const stored = JSON.parse(existingClaim.value_json) as { hash: string; userId: string; email: string };
      if (!verifyPassword(passcode, stored.hash)) {
        res.status(401).json({ error: 'Invalid administrator passcode.' });
        return;
      }
      const admin = db.prepare('SELECT * FROM profiles WHERE id = ?').get(stored.userId) as {
        id: string;
        email: string;
        full_name: string;
        preferred_currency: CurrencyCode;
        tax_profile: string;
      };
      const token = signSessionToken({ userId: admin.id, email: admin.email, role: 'admin' });
      res.json({
        token,
        user: {
          id: admin.id,
          email: admin.email,
          fullName: admin.full_name,
          role: 'admin',
          emailVerified: true,
          preferredCurrency: admin.preferred_currency,
          taxProfile: admin.tax_profile,
        },
      });
      return;
    }

    // Atomic first-run bootstrap claim
    const passHash = hashPassword(passcode);
    const adminId = uid('adm');
    const tx = db.transaction(() => {
      db.prepare(
        'INSERT INTO profiles (id, email, full_name, phone, password_hash, email_verified, preferred_currency, tax_profile, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)'
      ).run(adminId, email.toLowerCase(), fullName, '+255 22 211 8400', passHash, 'USD', 'business_b2b', 'active', now, now);
      db.prepare('INSERT INTO user_roles (id, user_id, role, created_at) VALUES (?, ?, ?, ?)').run(uid('role'), adminId, 'admin', now);
      db.prepare('INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, ?)').run(
        'admin_passcode_hash',
        JSON.stringify({ hash: passHash, userId: adminId, email: email.toLowerCase() }),
        now
      );
      logAudit(db, adminId, 'ADMIN_BOOTSTRAP_CLAIMED', 'profile', adminId, { email: email.toLowerCase() });
    });
    tx();

    const token = signSessionToken({ userId: adminId, email: email.toLowerCase(), role: 'admin' });
    res.status(201).json({
      token,
      user: {
        id: adminId,
        email: email.toLowerCase(),
        fullName,
        role: 'admin',
        emailVerified: true,
        preferredCurrency: 'USD',
        taxProfile: 'business_b2b',
      },
    });
  });

  router.post('/auth/register', rateLimit(20), (req, res) => {
    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(6).max(128),
      fullName: z.string().min(2).max(120),
      phone: z.string().min(5).max(30).default(''),
      preferredCurrency: z.enum(['TZS', 'USD']).default('TZS'),
      taxProfile: z.enum(['retail_b2c', 'business_b2b', 'vat_exempt', 'export_buyer']).default('retail_b2c'),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid registration data.' });
      return;
    }

    const email = parsed.data.email.toLowerCase();
    const existing = db.prepare('SELECT id FROM profiles WHERE email = ?').get(email);
    if (existing) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    const id = uid('usr');
    const now = new Date().toISOString();
    const verificationCode = String(100000 + crypto.randomInt(899999));

    const tx = db.transaction(() => {
      db.prepare(
        'INSERT INTO profiles (id, email, full_name, phone, password_hash, email_verified, verification_token, preferred_currency, tax_profile, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)'
      ).run(
        id,
        email,
        parsed.data.fullName,
        parsed.data.phone,
        hashPassword(parsed.data.password),
        verificationCode,
        parsed.data.preferredCurrency,
        parsed.data.taxProfile,
        'active',
        now,
        now
      );
      db.prepare('INSERT INTO user_roles (id, user_id, role, created_at) VALUES (?, ?, ?, ?)').run(uid('role'), id, 'customer', now);
      createNotification(
        db,
        id,
        'Welcome to SMG Corelink',
        `Your account has been created. Email verification code: ${verificationCode}.`
      );
      logAudit(db, id, 'USER_REGISTERED', 'profile', id, { email });
    });
    tx();

    const token = signSessionToken({ userId: id, email, role: 'customer' });
    res.status(201).json({
      token,
      verificationHint: verificationCode,
      user: {
        id,
        email,
        fullName: parsed.data.fullName,
        phone: parsed.data.phone,
        role: 'customer',
        emailVerified: false,
        preferredCurrency: parsed.data.preferredCurrency,
        taxProfile: parsed.data.taxProfile,
        status: 'active',
      },
    });
  });

  router.post('/auth/login', rateLimit(30), (req, res) => {
    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(1),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Valid email and password are required.' });
      return;
    }

    const email = parsed.data.email.toLowerCase();
    const profile = db.prepare('SELECT * FROM profiles WHERE email = ?').get(email) as
      | {
          id: string;
          email: string;
          full_name: string;
          phone: string;
          password_hash: string;
          email_verified: number;
          preferred_currency: CurrencyCode;
          tax_profile: string;
          tin_number: string;
          status: string;
        }
      | undefined;

    if (!profile || !verifyPassword(parsed.data.password, profile.password_hash)) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    if (profile.status === 'suspended') {
      res.status(403).json({ error: 'This account is suspended. Contact SMG Corelink administration.' });
      return;
    }

    const roleRow = db.prepare('SELECT role FROM user_roles WHERE user_id = ? LIMIT 1').get(profile.id) as
      | { role: UserRole }
      | undefined;
    const role: UserRole = roleRow?.role ?? 'customer';
    const merchant = db.prepare('SELECT id, business_name, verification_status FROM merchants WHERE user_id = ?').get(profile.id) as
      | { id: string; business_name: string; verification_status: string }
      | undefined;

    const token = signSessionToken({ userId: profile.id, email: profile.email, role });
    res.json({
      token,
      user: {
        id: profile.id,
        email: profile.email,
        fullName: profile.full_name,
        phone: profile.phone,
        role,
        emailVerified: Boolean(profile.email_verified),
        preferredCurrency: profile.preferred_currency,
        taxProfile: profile.tax_profile,
        tinNumber: profile.tin_number,
        status: profile.status,
        merchant: merchant
          ? {
              id: merchant.id,
              businessName: merchant.business_name,
              verificationStatus: merchant.verification_status,
            }
          : null,
      },
    });
  });

  router.post('/auth/verify-email', requireAuth, (req: AuthedRequest, res) => {
    const code = String(req.body?.code ?? '').trim();
    const profile = db.prepare('SELECT id, verification_token, email_verified FROM profiles WHERE id = ?').get(req.auth!.userId) as
      | { id: string; verification_token: string | null; email_verified: number }
      | undefined;
    if (!profile) {
      res.status(404).json({ error: 'Profile not found.' });
      return;
    }
    if (profile.email_verified) {
      res.json({ verified: true });
      return;
    }
    if (!code || code !== profile.verification_token) {
      res.status(400).json({ error: 'Invalid verification code.' });
      return;
    }
    db.prepare('UPDATE profiles SET email_verified = 1, verification_token = NULL, updated_at = ? WHERE id = ?').run(
      new Date().toISOString(),
      profile.id
    );
    res.json({ verified: true });
  });

  router.get('/auth/me', requireAuth, (req: AuthedRequest, res) => {
    const profile = db
      .prepare('SELECT id, email, full_name, phone, email_verified, preferred_currency, tax_profile, tin_number, status, notification_prefs, created_at FROM profiles WHERE id = ?')
      .get(req.auth!.userId) as
      | {
          id: string;
          email: string;
          full_name: string;
          phone: string;
          email_verified: number;
          preferred_currency: CurrencyCode;
          tax_profile: string;
          tin_number: string;
          status: string;
          notification_prefs: string;
          created_at: string;
        }
      | undefined;
    if (!profile) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    const merchant = db.prepare('SELECT * FROM merchants WHERE user_id = ?').get(profile.id);
    res.json({
      id: profile.id,
      email: profile.email,
      fullName: profile.full_name,
      phone: profile.phone,
      role: req.auth!.role,
      emailVerified: Boolean(profile.email_verified),
      preferredCurrency: profile.preferred_currency,
      taxProfile: profile.tax_profile,
      tinNumber: profile.tin_number,
      status: profile.status,
      notificationPrefs: JSON.parse(profile.notification_prefs || '{}'),
      merchant,
    });
  });

  router.patch('/auth/profile', requireAuth, (req: AuthedRequest, res) => {
    const schema = z.object({
      fullName: z.string().min(2).max(120).optional(),
      phone: z.string().max(30).optional(),
      preferredCurrency: z.enum(['TZS', 'USD']).optional(),
      taxProfile: z.enum(['retail_b2c', 'business_b2b', 'vat_exempt', 'export_buyer']).optional(),
      tinNumber: z.string().max(40).optional(),
      notificationPrefs: z.record(z.string(), z.boolean()).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid profile update payload.' });
      return;
    }
    const d = parsed.data;
    const now = new Date().toISOString();
    const existing = db.prepare('SELECT * FROM profiles WHERE id = ?').get(req.auth!.userId) as {
      full_name: string;
      phone: string;
      preferred_currency: string;
      tax_profile: string;
      tin_number: string;
      notification_prefs: string;
    };
    db.prepare(
      'UPDATE profiles SET full_name = ?, phone = ?, preferred_currency = ?, tax_profile = ?, tin_number = ?, notification_prefs = ?, updated_at = ? WHERE id = ?'
    ).run(
      d.fullName ?? existing.full_name,
      d.phone ?? existing.phone,
      d.preferredCurrency ?? existing.preferred_currency,
      d.taxProfile ?? existing.tax_profile,
      d.tinNumber ?? existing.tin_number,
      d.notificationPrefs ? JSON.stringify(d.notificationPrefs) : existing.notification_prefs,
      now,
      req.auth!.userId
    );
    res.json({ updated: true });
  });

  // =========================================================
  // 2. PUBLIC REFERENCE & CATALOG ENDPOINTS
  // =========================================================
  router.get('/ecommerce/categories', (_req, res) => {
    const rows = db.prepare('SELECT * FROM categories ORDER BY code ASC').all() as Array<{
      id: string;
      code: string;
      name: string;
      slug: string;
      description: string;
      subtypes_json: string;
      attribute_schema_json: string;
    }>;
    res.json(
      rows.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        slug: r.slug,
        description: r.description,
        subtypes: JSON.parse(r.subtypes_json),
        attributeSchema: JSON.parse(r.attribute_schema_json),
      }))
    );
  });

  router.get('/ecommerce/fx', (_req, res) => {
    const current = getActiveFx(db);
    const history = db
      .prepare('SELECT * FROM exchange_rates ORDER BY created_at DESC LIMIT 12')
      .all();
    res.json({ current, history });
  });

  router.get('/ecommerce/corridors', (_req, res) => {
    res.json(getCorridors(db));
  });

  router.get('/ecommerce/merchants', (_req, res) => {
    const rows = db
      .prepare(
        "SELECT id, business_name, city, country, description, verification_status, verified_at FROM merchants WHERE verification_status = 'approved' ORDER BY verified_at DESC"
      )
      .all();
    res.json(rows);
  });

  router.get('/ecommerce/products', (req, res) => {
    const category = String(req.query.category ?? '').trim();
    const search = String(req.query.search ?? '').trim().toLowerCase();
    const featured = req.query.featured === 'true';
    const newArrival = req.query.newArrival === 'true';
    const bestSeller = req.query.bestSeller === 'true';
    const merchantId = String(req.query.merchantId ?? '').trim();
    const sort = String(req.query.sort ?? 'featured');

    let products = hydrateProducts(db, 'WHERE p.is_active = 1');

    if (category) {
      products = products.filter(
        (p) => p.categoryCode.toLowerCase() === category.toLowerCase() || p.categoryId === category || p.categoryName.toLowerCase() === category.toLowerCase()
      );
    }
    if (merchantId) {
      products = products.filter((p) => p.merchantId === merchantId);
    }
    if (featured) products = products.filter((p) => p.isFeatured);
    if (newArrival) products = products.filter((p) => p.isNewArrival);
    if (bestSeller) products = products.filter((p) => p.isBestSeller);
    if (search) {
      products = products.filter(
        (p) =>
          p.name.toLowerCase().includes(search) ||
          p.description.toLowerCase().includes(search) ||
          p.categoryName.toLowerCase().includes(search) ||
          p.subtype.toLowerCase().includes(search) ||
          p.merchantName.toLowerCase().includes(search) ||
          p.sku.toLowerCase().includes(search)
      );
    }

    const fx = getActiveFx(db);
    const fxScaled = computeEffectiveRateScaled(fx.midRate, fx.spreadBps);
    if (sort === 'price_asc') {
      products.sort(
        (a, b) =>
          convertCurrencyMinor(a.basePriceMinor, a.baseCurrency, 'USD', fxScaled) -
          convertCurrencyMinor(b.basePriceMinor, b.baseCurrency, 'USD', fxScaled)
      );
    } else if (sort === 'price_desc') {
      products.sort(
        (a, b) =>
          convertCurrencyMinor(b.basePriceMinor, b.baseCurrency, 'USD', fxScaled) -
          convertCurrencyMinor(a.basePriceMinor, a.baseCurrency, 'USD', fxScaled)
      );
    } else if (sort === 'newest') {
      products.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    }

    res.json({ products, fx });
  });

  router.get('/ecommerce/products/:id', (req, res) => {
    const list = hydrateProducts(db, 'WHERE (p.id = ? OR p.slug = ?) AND p.is_active = 1', [req.params.id, req.params.id]);
    if (list.length === 0) {
      res.status(404).json({ error: 'Product not found.' });
      return;
    }
    const product = list[0];
    const reviews = db
      .prepare(
        'SELECT r.*, p.full_name as author_name FROM reviews r JOIN profiles p ON p.id = r.user_id WHERE r.product_id = ? ORDER BY r.created_at DESC'
      )
      .all(product.id);
    res.json({ product, reviews });
  });

  router.post('/ecommerce/products/:id/reviews', requireAuth, (req: AuthedRequest, res) => {
    const schema = z.object({
      rating: z.number().int().min(1).max(5),
      comment: z.string().min(3).max(800),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Rating (1-5) and comment are required.' });
      return;
    }
    const prod = db.prepare('SELECT id FROM products WHERE id = ?').get(req.params.id);
    if (!prod) {
      res.status(404).json({ error: 'Product not found.' });
      return;
    }
    const id = uid('rev');
    db.prepare('INSERT INTO reviews (id, product_id, user_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
      id,
      req.params.id,
      req.auth!.userId,
      parsed.data.rating,
      parsed.data.comment,
      new Date().toISOString()
    );
    res.status(201).json({ id, created: true });
  });

  // Merchant / Admin Product CRUD
  router.post('/ecommerce/products', requireAuth, requireRole('merchant', 'admin'), (req: AuthedRequest, res) => {
    const schema = z.object({
      categoryId: z.string().min(1),
      sku: z.string().min(2).max(60),
      name: z.string().min(3).max(160),
      subtype: z.string().min(2).max(100),
      description: z.string().min(5).max(3000),
      basePriceMinor: z.number().int().positive(),
      baseCurrency: z.enum(['TZS', 'USD']),
      weightKg: z.number().positive().default(1),
      lengthCm: z.number().positive().default(25),
      widthCm: z.number().positive().default(20),
      heightCm: z.number().positive().default(10),
      stockQty: z.number().int().min(0).default(10),
      imageUrl: z.string().min(1).default('/src/assets/images/hero_corelink_commerce_1795560174816.jpg'),
      attributes: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
      wholesaleTiers: z
        .array(z.object({ minQty: z.number().int().min(2), discountPercent: z.number().min(1).max(60) }))
        .default([]),
      promotion: z
        .object({ type: z.enum(['percentage', 'fixed']), value: z.number().positive(), active: z.boolean() })
        .nullable()
        .optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid product fields.' });
      return;
    }

    let merchantId = '';
    if (req.auth!.role === 'merchant') {
      const m = db.prepare('SELECT id, verification_status FROM merchants WHERE user_id = ?').get(req.auth!.userId) as
        | { id: string; verification_status: string }
        | undefined;
      if (!m) {
        res.status(403).json({ error: 'Merchant profile not found.' });
        return;
      }
      if (m.verification_status !== 'approved') {
        res.status(403).json({ error: 'Your merchant account must be approved by an administrator before publishing products.' });
        return;
      }
      merchantId = m.id;
    } else {
      merchantId = String(req.body.merchantId || 'mrc-01');
    }

    const d = parsed.data;
    const id = uid('prd');
    const slug = `${d.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60)}-${id.slice(-4)}`;
    const now = new Date().toISOString();

    const tx = db.transaction(() => {
      db.prepare(
        'INSERT INTO products (id, merchant_id, category_id, sku, name, slug, subtype, description, base_price_minor, base_currency, weight_kg, length_cm, width_cm, height_cm, is_featured, is_new_arrival, is_best_seller, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, 0, 1, ?, ?)'
      ).run(id, merchantId, d.categoryId, d.sku, d.name, slug, d.subtype, d.description, d.basePriceMinor, d.baseCurrency, d.weightKg, d.lengthCm, d.widthCm, d.heightCm, now, now);
      db.prepare('INSERT INTO product_images (id, product_id, image_url, sort_order, created_at) VALUES (?, ?, ?, 0, ?)').run(
        uid('img'),
        id,
        d.imageUrl,
        now
      );
      db.prepare('INSERT INTO product_attributes (id, product_id, attributes_json, updated_at) VALUES (?, ?, ?, ?)').run(
        uid('attr'),
        id,
        JSON.stringify(d.attributes),
        now
      );
      db.prepare('INSERT INTO inventory (id, product_id, stock_qty, reserved_qty, low_stock_threshold, updated_at) VALUES (?, ?, ?, 0, 5, ?)').run(
        uid('inv'),
        id,
        d.stockQty,
        now
      );
      for (const w of d.wholesaleTiers) {
        db.prepare('INSERT INTO discount_rules (id, product_id, rule_kind, min_qty, discount_type, discount_value, active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)').run(
          uid('w'),
          id,
          'wholesale_tier',
          w.minQty,
          'percentage',
          w.discountPercent,
          now
        );
      }
      if (d.promotion && d.promotion.active) {
        db.prepare('INSERT INTO discount_rules (id, product_id, rule_kind, min_qty, discount_type, discount_value, active, created_at) VALUES (?, ?, ?, 1, ?, ?, 1, ?)').run(
          uid('promo'),
          id,
          'promotion',
          d.promotion.type,
          d.promotion.value,
          now
        );
      }
      logAudit(db, req.auth!.userId, 'PRODUCT_CREATED', 'product', id, { sku: d.sku, name: d.name });
    });
    tx();

    const created = hydrateProducts(db, 'WHERE p.id = ?', [id])[0];
    res.status(201).json({ product: created });
  });

  router.patch('/ecommerce/products/:id', requireAuth, requireRole('merchant', 'admin'), (req: AuthedRequest, res) => {
    const existing = db.prepare('SELECT p.*, m.user_id as owner_user_id FROM products p JOIN merchants m ON m.id = p.merchant_id WHERE p.id = ?').get(
      req.params.id
    ) as
      | { id: string; owner_user_id: string; base_price_minor: number; base_currency: string; name: string; description: string; is_active: number }
      | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Product not found.' });
      return;
    }
    if (req.auth!.role === 'merchant' && existing.owner_user_id !== req.auth!.userId) {
      res.status(403).json({ error: 'Forbidden: merchants may only edit their own products.' });
      return;
    }

    const now = new Date().toISOString();
    const newPrice = typeof req.body.basePriceMinor === 'number' ? Math.round(req.body.basePriceMinor) : existing.base_price_minor;
    const newCurrency = req.body.baseCurrency === 'USD' || req.body.baseCurrency === 'TZS' ? req.body.baseCurrency : existing.base_currency;

    const tx = db.transaction(() => {
      db.prepare('UPDATE products SET name = ?, description = ?, base_price_minor = ?, base_currency = ?, is_active = ?, updated_at = ? WHERE id = ?').run(
        req.body.name ?? existing.name,
        req.body.description ?? existing.description,
        newPrice,
        newCurrency,
        typeof req.body.isActive === 'boolean' ? (req.body.isActive ? 1 : 0) : existing.is_active,
        now,
        existing.id
      );
      if (newPrice !== existing.base_price_minor) {
        db.prepare('INSERT INTO price_history (id, product_id, old_price_minor, new_price_minor, currency, changed_by, changed_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
          uid('ph'),
          existing.id,
          existing.base_price_minor,
          newPrice,
          newCurrency,
          req.auth!.userId,
          now
        );
      }
      if (typeof req.body.stockQty === 'number') {
        db.prepare('UPDATE inventory SET stock_qty = ?, updated_at = ? WHERE product_id = ?').run(
          Math.max(0, Math.floor(req.body.stockQty)),
          now,
          existing.id
        );
      }
      logAudit(db, req.auth!.userId, 'PRODUCT_UPDATED', 'product', existing.id, { newPrice, newCurrency });
    });
    tx();

    const updated = hydrateProducts(db, 'WHERE p.id = ?', [existing.id])[0];
    res.json({ product: updated });
  });

  router.delete('/ecommerce/products/:id', requireAuth, requireRole('merchant', 'admin'), (req: AuthedRequest, res) => {
    const existing = db.prepare('SELECT p.id, m.user_id as owner_user_id FROM products p JOIN merchants m ON m.id = p.merchant_id WHERE p.id = ?').get(
      req.params.id
    ) as { id: string; owner_user_id: string } | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Product not found.' });
      return;
    }
    if (req.auth!.role === 'merchant' && existing.owner_user_id !== req.auth!.userId) {
      res.status(403).json({ error: 'Forbidden: merchants may only delete their own products.' });
      return;
    }
    db.prepare('UPDATE products SET is_active = 0, updated_at = ? WHERE id = ?').run(new Date().toISOString(), existing.id);
    logAudit(db, req.auth!.userId, 'PRODUCT_ARCHIVED', 'product', existing.id);
    res.json({ deleted: true });
  });

  // =========================================================
  // 3. CART & SERVER-SIDE QUOTE ENGINE (15-MIN FX LOCK)
  // =========================================================
  router.get('/ecommerce/cart', (req: AuthedRequest, res) => {
    const sessionToken = String(req.headers['x-cart-session'] || 'anon-default');
    const cart = getOrCreateCart(db, req.auth?.userId, sessionToken);
    const items = getHydratedCartItems(db, cart.id);
    res.json({
      cartId: cart.id,
      fxLockedUntil: cart.fx_locked_until,
      items,
    });
  });

  router.post('/ecommerce/cart/items', (req: AuthedRequest, res) => {
    const schema = z.object({
      productId: z.string().min(1),
      variantId: z.string().nullable().optional(),
      quantity: z.number().int().min(1).max(500).default(1),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid cart item payload.' });
      return;
    }

    const sessionToken = String(req.headers['x-cart-session'] || 'anon-default');
    const cart = getOrCreateCart(db, req.auth?.userId, sessionToken);
    const prod = db.prepare('SELECT id FROM products WHERE id = ? AND is_active = 1').get(parsed.data.productId);
    if (!prod) {
      res.status(404).json({ error: 'Product not found.' });
      return;
    }

    const inv = db.prepare('SELECT stock_qty FROM inventory WHERE product_id = ?').get(parsed.data.productId) as
      | { stock_qty: number }
      | undefined;
    const available = inv?.stock_qty ?? 0;

    const existing = db
      .prepare("SELECT id, quantity FROM cart_items WHERE cart_id = ? AND product_id = ? AND IFNULL(variant_id, '') = IFNULL(?, '')")
      .get(cart.id, parsed.data.productId, parsed.data.variantId ?? null) as { id: string; quantity: number } | undefined;

    const nextQty = (existing?.quantity ?? 0) + parsed.data.quantity;
    if (nextQty > available) {
      res.status(400).json({ error: `Requested quantity (${nextQty}) exceeds available stock (${available}).` });
      return;
    }

    const now = new Date().toISOString();
    if (existing) {
      db.prepare('UPDATE cart_items SET quantity = ?, updated_at = ? WHERE id = ?').run(nextQty, now, existing.id);
    } else {
      db.prepare('INSERT INTO cart_items (id, cart_id, product_id, variant_id, quantity, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
        uid('ci'),
        cart.id,
        parsed.data.productId,
        parsed.data.variantId ?? null,
        parsed.data.quantity,
        now,
        now
      );
    }
    res.status(201).json({ cartId: cart.id, items: getHydratedCartItems(db, cart.id) });
  });

  router.patch('/ecommerce/cart/items/:id', (req: AuthedRequest, res) => {
    const qty = Number(req.body?.quantity);
    if (!Number.isInteger(qty) || qty < 1 || qty > 500) {
      res.status(400).json({ error: 'Quantity must be between 1 and 500.' });
      return;
    }
    const sessionToken = String(req.headers['x-cart-session'] || 'anon-default');
    const cart = getOrCreateCart(db, req.auth?.userId, sessionToken);
    const ci = db.prepare('SELECT * FROM cart_items WHERE id = ? AND cart_id = ?').get(req.params.id, cart.id) as
      | { id: string; product_id: string }
      | undefined;
    if (!ci) {
      res.status(404).json({ error: 'Cart item not found.' });
      return;
    }
    const inv = db.prepare('SELECT stock_qty FROM inventory WHERE product_id = ?').get(ci.product_id) as { stock_qty: number };
    if (qty > inv.stock_qty) {
      res.status(400).json({ error: `Only ${inv.stock_qty} units in stock.` });
      return;
    }
    db.prepare('UPDATE cart_items SET quantity = ?, updated_at = ? WHERE id = ?').run(qty, new Date().toISOString(), ci.id);
    res.json({ cartId: cart.id, items: getHydratedCartItems(db, cart.id) });
  });

  router.delete('/ecommerce/cart/items/:id', (req: AuthedRequest, res) => {
    const sessionToken = String(req.headers['x-cart-session'] || 'anon-default');
    const cart = getOrCreateCart(db, req.auth?.userId, sessionToken);
    db.prepare('DELETE FROM cart_items WHERE id = ? AND cart_id = ?').run(req.params.id, cart.id);
    res.json({ cartId: cart.id, items: getHydratedCartItems(db, cart.id) });
  });

  router.post('/ecommerce/cart/quote', (req: AuthedRequest, res) => {
    const sessionToken = String(req.headers['x-cart-session'] || 'anon-default');
    const cart = getOrCreateCart(db, req.auth?.userId, sessionToken);
    const items = getHydratedCartItems(db, cart.id);
    if (items.length === 0) {
      res.status(400).json({ error: 'Cart is empty.' });
      return;
    }

    const corridors = getCorridors(db);
    const corridorCode = String(req.body?.corridorCode || 'LOG-01');
    const corridor = corridors.find((c) => c.code === corridorCode && c.active) ?? corridors[0];
    const destinationZone = String(req.body?.destinationZone || corridor.coverageZones[0]);
    const freightMode = req.body?.freightMode as 'air' | 'sea_lcl' | 'sea_fcl' | undefined;
    const couponCode = String(req.body?.couponCode || '').trim().toUpperCase();
    const buyerTaxProfile = (req.body?.buyerTaxProfile || 'retail_b2c') as
      | 'retail_b2c'
      | 'business_b2b'
      | 'vat_exempt'
      | 'export_buyer';
    const paymentIsElectronicB2C = Boolean(req.body?.paymentIsElectronicB2C);
    const hasExportDocs = Boolean(req.body?.hasExportDocs);
    const hasExemptionDocs = Boolean(req.body?.hasExemptionDocs);

    let coupon: CouponRecord | null = null;
    let couponMessage: string | null = null;
    if (couponCode) {
      const cRow = db.prepare('SELECT * FROM coupons WHERE UPPER(code) = ?').get(couponCode) as
        | {
            id: string;
            code: string;
            discount_type: 'percentage' | 'fixed';
            discount_value: number;
            currency: CurrencyCode;
            min_purchase_minor: number;
            max_discount_minor: number | null;
            usage_limit: number | null;
            used_count: number;
            eligible_segment: 'all' | 'retail' | 'wholesale';
            expires_at: string | null;
            active: number;
          }
        | undefined;
      if (!cRow || !cRow.active) {
        couponMessage = `Coupon "${couponCode}" is invalid or inactive.`;
      } else {
        coupon = {
          id: cRow.id,
          code: cRow.code,
          type: cRow.discount_type,
          value: cRow.discount_value,
          currency: cRow.currency,
          minPurchaseMinor: cRow.min_purchase_minor,
          maxDiscountMinor: cRow.max_discount_minor,
          usageLimit: cRow.usage_limit,
          usedCount: cRow.used_count,
          eligibleSegment: cRow.eligible_segment,
          expiresAt: cRow.expires_at,
          active: Boolean(cRow.active),
        };
      }
    }

    // Lock FX rate on cart for 15 minutes (reuse if still valid!)
    const nowMs = Date.now();
    const lockValid = cart.fx_locked_until && Date.parse(cart.fx_locked_until) > nowMs && cart.locked_fx_mid_rate;
    const activeFx = getActiveFx(db);
    const midRate = lockValid ? cart.locked_fx_mid_rate! : activeFx.midRate;
    const spreadBps = lockValid ? (cart.locked_fx_spread_bps ?? activeFx.spreadBps) : activeFx.spreadBps;
    const lockedUntil = lockValid ? cart.fx_locked_until! : new Date(nowMs + 15 * 60 * 1000).toISOString();

    if (!lockValid) {
      db.prepare('UPDATE carts SET locked_fx_mid_rate = ?, locked_fx_spread_bps = ?, fx_locked_until = ?, updated_at = ? WHERE id = ?').run(
        midRate,
        spreadBps,
        lockedUntil,
        new Date(nowMs).toISOString(),
        cart.id
      );
    }

    const quote = calculateCheckoutQuote({
      items: items.map((ci) => ({
        productId: ci.productId,
        variantId: ci.variantId,
        name: ci.variantName ? `${ci.product.name} (${ci.variantName})` : ci.product.name,
        sku: ci.product.sku,
        quantity: ci.quantity,
        basePriceMinor: ci.product.basePriceMinor,
        baseCurrency: ci.product.baseCurrency,
        weightKg: ci.product.weightKg,
        lengthCm: ci.product.lengthCm,
        widthCm: ci.product.widthCm,
        heightCm: ci.product.heightCm,
        wholesaleTiers: ci.product.wholesaleTiers,
        promotion: ci.product.promotion,
      })),
      corridor,
      destinationZone,
      freightMode,
      coupon,
      taxRules: getTaxRules(db),
      buyerTaxProfile,
      paymentIsElectronicB2C,
      hasExportDocs,
      hasExemptionDocs,
      fxMidRate: midRate,
      fxSpreadBps: spreadBps,
    });

    quote.fxLockedUntil = lockedUntil;
    res.json({ quote, couponMessage });
  });

  // =========================================================
  // 4. CHECKOUT & PAYMENTS (SERVER-CALCULATED & IDEMPOTENT)
  // =========================================================
  router.post('/ecommerce/checkout/initiate', requireAuth, (req: AuthedRequest, res) => {
    const schema = z.object({
      corridorCode: z.enum(['LOG-01', 'LOG-02', 'LOG-03', 'LOG-04']),
      destinationZone: z.string().min(1),
      freightMode: z.enum(['air', 'sea_lcl', 'sea_fcl']).optional(),
      couponCode: z.string().optional(),
      buyerTaxProfile: z.enum(['retail_b2c', 'business_b2b', 'vat_exempt', 'export_buyer']).default('retail_b2c'),
      paymentIsElectronicB2C: z.boolean().default(false),
      hasExportDocs: z.boolean().default(false),
      hasExemptionDocs: z.boolean().default(false),
      idempotencyKey: z.string().min(4).max(120).optional(),
      address: z.object({
        recipientName: z.string().min(2),
        phone: z.string().min(5),
        country: z.string().min(2),
        regionOrCity: z.string().min(2),
        district: z.string().min(1),
        streetAddress: z.string().min(3),
      }),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Incomplete checkout details.' });
      return;
    }

    if (parsed.data.idempotencyKey) {
      const existingOrd = db.prepare('SELECT id, order_number FROM orders WHERE idempotency_key = ?').get(parsed.data.idempotencyKey) as
        | { id: string; order_number: string }
        | undefined;
      if (existingOrd) {
        res.json({ orderId: existingOrd.id, orderNumber: existingOrd.order_number, idempotentReplay: true });
        return;
      }
    }

    const sessionToken = String(req.headers['x-cart-session'] || 'anon-default');
    const userCart = getOrCreateCart(db, req.auth!.userId, sessionToken);
    let items = getHydratedCartItems(db, userCart.id);
    let activeCart = userCart;

    // If items were added while anonymous before signing in, merge session cart
    if (items.length === 0 && sessionToken) {
      const anonCart = db.prepare('SELECT * FROM carts WHERE session_token = ?').get(sessionToken) as typeof userCart | undefined;
      if (anonCart) {
        items = getHydratedCartItems(db, anonCart.id);
        activeCart = anonCart;
      }
    }

    if (items.length === 0) {
      res.status(400).json({ error: 'Your cart is empty.' });
      return;
    }

    const corridors = getCorridors(db);
    const corridor = corridors.find((c) => c.code === parsed.data.corridorCode && c.active);
    if (!corridor) {
      res.status(400).json({ error: 'Selected shipping corridor is unavailable.' });
      return;
    }

    let coupon: CouponRecord | null = null;
    const code = parsed.data.couponCode?.trim().toUpperCase();
    if (code) {
      const cRow = db.prepare('SELECT * FROM coupons WHERE UPPER(code) = ? AND active = 1').get(code) as
        | {
            id: string;
            code: string;
            discount_type: 'percentage' | 'fixed';
            discount_value: number;
            currency: CurrencyCode;
            min_purchase_minor: number;
            max_discount_minor: number | null;
            usage_limit: number | null;
            used_count: number;
            eligible_segment: 'all' | 'retail' | 'wholesale';
            expires_at: string | null;
            active: number;
          }
        | undefined;
      if (cRow) {
        coupon = {
          id: cRow.id,
          code: cRow.code,
          type: cRow.discount_type,
          value: cRow.discount_value,
          currency: cRow.currency,
          minPurchaseMinor: cRow.min_purchase_minor,
          maxDiscountMinor: cRow.max_discount_minor,
          usageLimit: cRow.usage_limit,
          usedCount: cRow.used_count,
          eligibleSegment: cRow.eligible_segment,
          expiresAt: cRow.expires_at,
          active: true,
        };
      }
    }

    const activeFx = getActiveFx(db);
    const lockValid = activeCart.fx_locked_until && Date.parse(activeCart.fx_locked_until) > Date.now() && activeCart.locked_fx_mid_rate;
    const midRate = lockValid ? activeCart.locked_fx_mid_rate! : activeFx.midRate;
    const spreadBps = lockValid ? (activeCart.locked_fx_spread_bps ?? activeFx.spreadBps) : activeFx.spreadBps;

    const quote = calculateCheckoutQuote({
      items: items.map((ci) => ({
        productId: ci.productId,
        variantId: ci.variantId,
        name: ci.variantName ? `${ci.product.name} (${ci.variantName})` : ci.product.name,
        sku: ci.product.sku,
        quantity: ci.quantity,
        basePriceMinor: ci.product.basePriceMinor,
        baseCurrency: ci.product.baseCurrency,
        weightKg: ci.product.weightKg,
        lengthCm: ci.product.lengthCm,
        widthCm: ci.product.widthCm,
        heightCm: ci.product.heightCm,
        wholesaleTiers: ci.product.wholesaleTiers,
        promotion: ci.product.promotion,
      })),
      corridor,
      destinationZone: parsed.data.destinationZone,
      freightMode: parsed.data.freightMode,
      coupon,
      taxRules: getTaxRules(db),
      buyerTaxProfile: parsed.data.buyerTaxProfile,
      paymentIsElectronicB2C: parsed.data.paymentIsElectronicB2C,
      hasExportDocs: parsed.data.hasExportDocs,
      hasExemptionDocs: parsed.data.hasExemptionDocs,
      fxMidRate: midRate,
      fxSpreadBps: spreadBps,
    });

    const primaryMerchantId = items[0].product.merchantId;
    const orderId = uid('ord');
    const orderNumber = `SMG-2026-${Math.floor(1000 + crypto.randomInt(8999))}`;
    const invoiceNumber = `INV-${orderNumber}`;
    const trackingRef = `SMG-${corridor.code.slice(-2)}-${crypto.randomInt(10000, 99999)}`;
    const otpPlain = String(crypto.randomInt(100000, 999999));
    const otpHint = `${otpPlain.slice(0, 2)}**${otpPlain.slice(-2)}`;
    const now = new Date().toISOString();

    const tx = db.transaction(() => {
      db.prepare(
        'INSERT INTO orders (id, order_number, customer_id, merchant_id, status, corridor_code, incoterm, destination_zone, locked_fx_rate, total_tzs, total_usd_cents, idempotency_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        orderId,
        orderNumber,
        req.auth!.userId,
        primaryMerchantId,
        'Awaiting Payment',
        corridor.code,
        corridor.incoterm,
        parsed.data.destinationZone,
        quote.lockedFxEffectiveRate,
        quote.finalTotalTzs,
        quote.finalTotalUsdCents,
        parsed.data.idempotencyKey ?? null,
        now,
        now
      );

      for (let idx = 0; idx < quote.lines.length; idx++) {
        const l = quote.lines[idx];
        const cartItem = items[idx];
        db.prepare(
          'INSERT INTO order_items (id, order_id, product_id, variant_id, product_name, sku, quantity, unit_price_tzs, unit_price_usd_cents, product_discount_tzs, product_discount_usd_cents, line_total_tzs, line_total_usd_cents) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(
          uid('oi'),
          orderId,
          l.productId,
          l.variantId ?? null,
          l.name,
          l.sku,
          l.quantity,
          l.unitPriceTzs,
          l.unitPriceUsdCents,
          l.productDiscountTzs,
          l.productDiscountUsdCents,
          l.netSubtotalTzs,
          l.netSubtotalUsdCents
        );

        // Deduct inventory atomically
        const inv = db.prepare('SELECT stock_qty FROM inventory WHERE product_id = ?').get(l.productId) as { stock_qty: number };
        if (inv.stock_qty < l.quantity) {
          throw new Error(`Insufficient stock for ${l.name}`);
        }
        db.prepare('UPDATE inventory SET stock_qty = stock_qty - ?, updated_at = ? WHERE product_id = ?').run(
          l.quantity,
          now,
          l.productId
        );
        if (cartItem.variantId) {
          db.prepare('UPDATE product_variants SET stock_qty = MAX(0, stock_qty - ?) WHERE id = ?').run(l.quantity, cartItem.variantId);
        }
      }

      db.prepare(
        'INSERT INTO order_addresses (id, order_id, recipient_name, phone, country, region_or_city, district, street_address) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        uid('oa'),
        orderId,
        parsed.data.address.recipientName,
        parsed.data.address.phone,
        parsed.data.address.country,
        parsed.data.address.regionOrCity,
        parsed.data.address.district,
        parsed.data.address.streetAddress
      );

      db.prepare(
        'INSERT INTO order_calculations (id, order_id, gross_subtotal_tzs, gross_subtotal_usd_cents, product_discount_tzs, product_discount_usd_cents, coupon_code, coupon_discount_tzs, coupon_discount_usd_cents, shipping_fee_tzs, shipping_fee_usd_cents, insurance_fee_tzs, insurance_fee_usd_cents, tax_rule_code, tax_rate_bps, vat_tzs, vat_usd_cents, final_total_tzs, final_total_usd_cents) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        uid('oc'),
        orderId,
        quote.grossSubtotalTzs,
        quote.grossSubtotalUsdCents,
        quote.productDiscountTzs,
        quote.productDiscountUsdCents,
        quote.couponCode,
        quote.couponDiscountTzs,
        quote.couponDiscountUsdCents,
        quote.shippingFeeTzs,
        quote.shippingFeeUsdCents,
        quote.insuranceFeeTzs,
        quote.insuranceFeeUsdCents,
        quote.appliedTaxRuleCode,
        quote.appliedTaxRateBps,
        quote.vatTzs,
        quote.vatUsdCents,
        quote.finalTotalTzs,
        quote.finalTotalUsdCents
      );

      if (quote.couponCode && coupon) {
        db.prepare('UPDATE coupons SET used_count = used_count + 1 WHERE id = ?').run(coupon.id);
        db.prepare('INSERT INTO coupon_redemptions (id, coupon_id, user_id, order_id, redeemed_at) VALUES (?, ?, ?, ?, ?)').run(
          uid('cr'),
          coupon.id,
          req.auth!.userId,
          orderId,
          now
        );
      }

      const escrowId = uid('esc');
      db.prepare(
        'INSERT INTO escrow_accounts (id, order_id, merchant_id, state, held_tzs, held_usd_cents, released_tzs, released_usd_cents, updated_at) VALUES (?, ?, ?, ?, 0, 0, 0, 0, ?)'
      ).run(escrowId, orderId, primaryMerchantId, 'Awaiting payment', now);
      db.prepare(
        'INSERT INTO escrow_ledger_entries (id, escrow_account_id, entry_type, amount_tzs, amount_usd_cents, note, actor_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(uid('ele'), escrowId, 'ORDER_CREATED', quote.finalTotalTzs, quote.finalTotalUsdCents, 'Order initiated; awaiting verified payment confirmation', req.auth!.userId, now);

      const shpId = uid('shp');
      db.prepare(
        'INSERT INTO shipments (id, order_id, corridor_code, tracking_reference, status, packed_inspected, assigned_staff_id, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)'
      ).run(shpId, orderId, corridor.code, trackingRef, 'Awaiting Payment', 'usr-ops-1', now);
      db.prepare(
        'INSERT INTO shipment_events (id, shipment_id, milestone, location, notes, actor_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(uid('se'), shpId, 'Order Placed', 'SMG Corelink Platform', `Locked FX 1 USD = ${quote.lockedFxEffectiveRate} TZS`, req.auth!.userId, now);

      db.prepare('INSERT INTO delivery_otps (id, shipment_id, otp_hash, otp_hint, verified, created_at) VALUES (?, ?, ?, ?, 0, ?)').run(
        uid('otp'),
        shpId,
        hashPassword(otpPlain),
        otpHint,
        now
      );

      db.prepare('INSERT INTO invoices (id, order_id, invoice_number, invoice_type, issued_at) VALUES (?, ?, ?, ?, ?)').run(
        uid('inv'),
        orderId,
        invoiceNumber,
        corridor.isExport ? 'commercial_invoice' : 'customer_invoice',
        now
      );

      db.prepare('DELETE FROM cart_items WHERE cart_id = ?').run(activeCart.id);
      createNotification(db, req.auth!.userId, 'Order Created', `Order ${orderNumber} is awaiting payment. Delivery OTP: ${otpPlain} (save for handover).`);
      logAudit(db, req.auth!.userId, 'ORDER_INITIATED', 'order', orderId, { orderNumber, totalTzs: quote.finalTotalTzs, totalUsdCents: quote.finalTotalUsdCents });
    });

    try {
      tx();
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Checkout failed.' });
      return;
    }

    res.status(201).json({
      orderId,
      orderNumber,
      invoiceNumber,
      trackingReference: trackingRef,
      deliveryOtpForCustomer: otpPlain,
      quote,
    });
  });

  router.post('/ecommerce/payments/initiate', requireAuth, rateLimit(20), (req: AuthedRequest, res) => {
    const schema = z.object({
      orderId: z.string().min(1),
      paymentMethod: z.enum(['mobile_money', 'bank_transfer', 'card', 'escrow']),
      provider: z.string().min(1),
      currency: z.enum(['TZS', 'USD']).default('TZS'),
      phoneNumber: z.string().optional(),
      idempotencyKey: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid payment initiation request.' });
      return;
    }

    if (parsed.data.idempotencyKey) {
      const existingPay = db.prepare('SELECT * FROM payments WHERE idempotency_key = ?').get(parsed.data.idempotencyKey);
      if (existingPay) {
        res.json({ payment: existingPay, idempotentReplay: true });
        return;
      }
    }

    const order = db.prepare('SELECT * FROM orders WHERE id = ? AND customer_id = ?').get(parsed.data.orderId, req.auth!.userId) as
      | { id: string; order_number: string; total_tzs: number; total_usd_cents: number; status: string }
      | undefined;
    if (!order) {
      res.status(404).json({ error: 'Order not found.' });
      return;
    }

    if (parsed.data.paymentMethod === 'mobile_money' && (!parsed.data.phoneNumber || parsed.data.phoneNumber.trim().length < 9)) {
      res.status(400).json({ error: 'A valid mobile money phone number is required.' });
      return;
    }

    const paymentId = uid('pay');
    const adapterRes = initiateUnifiedPayment({
      paymentId,
      orderNumber: order.order_number,
      method: parsed.data.paymentMethod,
      provider: parsed.data.provider,
      amountTzs: order.total_tzs,
      amountUsdCents: order.total_usd_cents,
      currency: parsed.data.currency,
      phoneNumber: parsed.data.phoneNumber,
    });

    const now = new Date().toISOString();
    const tx = db.transaction(() => {
      db.prepare(
        'INSERT INTO payments (id, order_id, payment_method, provider, provider_reference, amount_tzs, amount_usd_cents, currency, status, instructions, idempotency_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        paymentId,
        order.id,
        parsed.data.paymentMethod,
        parsed.data.provider,
        adapterRes.providerReference,
        order.total_tzs,
        order.total_usd_cents,
        parsed.data.currency,
        adapterRes.status,
        adapterRes.instructions,
        parsed.data.idempotencyKey ?? null,
        now,
        now
      );
      db.prepare('INSERT INTO payment_events (id, payment_id, event_type, payload_json, created_at) VALUES (?, ?, ?, ?, ?)').run(
        uid('pe'),
        paymentId,
        'INITIATED',
        JSON.stringify(adapterRes),
        now
      );
      logAudit(db, req.auth!.userId, 'PAYMENT_INITIATED', 'payment', paymentId, {
        orderId: order.id,
        method: parsed.data.paymentMethod,
        mode: adapterRes.mode,
      });
    });
    tx();

    const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId);
    res.status(201).json({ payment, adapter: adapterRes });
  });

  router.get('/ecommerce/payments/:id', requireAuth, (req: AuthedRequest, res) => {
    const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.id) as
      | { id: string; order_id: string }
      | undefined;
    if (!payment) {
      res.status(404).json({ error: 'Payment not found.' });
      return;
    }
    const order = db.prepare('SELECT customer_id FROM orders WHERE id = ?').get(payment.order_id) as { customer_id: string };
    if (req.auth!.role !== 'admin' && order.customer_id !== req.auth!.userId) {
      res.status(403).json({ error: 'Forbidden.' });
      return;
    }
    const events = db.prepare('SELECT * FROM payment_events WHERE payment_id = ? ORDER BY created_at DESC').all(payment.id);
    res.json({ payment, events });
  });

  router.post('/ecommerce/payments/:id/proof', requireAuth, (req: AuthedRequest, res) => {
    const proofText = String(req.body?.proofUrl || req.body?.referenceNote || '').trim();
    if (!proofText) {
      res.status(400).json({ error: 'Bank slip reference or document filename is required.' });
      return;
    }
    const payment = db.prepare('SELECT p.*, o.customer_id FROM payments p JOIN orders o ON o.id = p.order_id WHERE p.id = ?').get(
      req.params.id
    ) as { id: string; customer_id: string } | undefined;
    if (!payment || (payment.customer_id !== req.auth!.userId && req.auth!.role !== 'admin')) {
      res.status(404).json({ error: 'Payment record not found.' });
      return;
    }
    const now = new Date().toISOString();
    db.prepare('UPDATE payments SET proof_url = ?, status = ?, updated_at = ? WHERE id = ?').run(
      proofText,
      'awaiting_reconciliation',
      now,
      payment.id
    );
    db.prepare('INSERT INTO payment_events (id, payment_id, event_type, payload_json, created_at) VALUES (?, ?, ?, ?, ?)').run(
      uid('pe'),
      payment.id,
      'PROOF_SUBMITTED',
      JSON.stringify({ proofText }),
      now
    );
    res.json({ updated: true, status: 'awaiting_reconciliation' });
  });

  router.post('/ecommerce/payments/webhook', (req, res) => {
    const signature = req.headers['x-corelink-signature'] as string | undefined;
    const rawBody = JSON.stringify(req.body ?? {});
    if (!verifyWebhookSignature(rawBody, signature)) {
      res.status(401).json({ error: 'Invalid webhook signature.' });
      return;
    }

    const schema = z.object({
      paymentId: z.string().min(1),
      status: z.enum(['confirmed', 'failed']),
      providerReference: z.string().min(2),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid webhook payload.' });
      return;
    }

    const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(parsed.data.paymentId) as
      | { id: string; order_id: string; amount_tzs: number; amount_usd_cents: number; status: string }
      | undefined;
    if (!payment) {
      res.status(404).json({ error: 'Payment not found.' });
      return;
    }
    if (payment.status === 'confirmed') {
      res.json({ acknowledged: true, idempotent: true });
      return;
    }

    const now = new Date().toISOString();
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(payment.order_id) as {
      id: string;
      order_number: string;
      customer_id: string;
      merchant_id: string;
    };

    const tx = db.transaction(() => {
      db.prepare('UPDATE payments SET status = ?, provider_reference = ?, updated_at = ? WHERE id = ?').run(
        parsed.data.status,
        parsed.data.providerReference,
        now,
        payment.id
      );
      db.prepare('INSERT INTO payment_events (id, payment_id, event_type, payload_json, created_at) VALUES (?, ?, ?, ?, ?)').run(
        uid('pe'),
        payment.id,
        `WEBHOOK_${parsed.data.status.toUpperCase()}`,
        rawBody,
        now
      );

      if (parsed.data.status === 'confirmed') {
        db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?').run('Escrow Funded', now, order.id);
        db.prepare('UPDATE shipments SET status = ?, updated_at = ? WHERE order_id = ?').run('Awaiting Packing', now, order.id);
        const shp = db.prepare('SELECT id FROM shipments WHERE order_id = ?').get(order.id) as { id: string };
        db.prepare('INSERT INTO shipment_events (id, shipment_id, milestone, location, notes, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
          uid('se'),
          shp.id,
          'Payment Confirmed & Escrow Funded',
          'SMG Corelink Settlement Ledger',
          `Ref: ${parsed.data.providerReference}`,
          now
        );

        const esc = db.prepare('SELECT id FROM escrow_accounts WHERE order_id = ?').get(order.id) as { id: string };
        db.prepare('UPDATE escrow_accounts SET state = ?, held_tzs = ?, held_usd_cents = ?, updated_at = ? WHERE id = ?').run(
          'Escrow held',
          payment.amount_tzs,
          payment.amount_usd_cents,
          now,
          esc.id
        );
        db.prepare(
          'INSERT INTO escrow_ledger_entries (id, escrow_account_id, entry_type, amount_tzs, amount_usd_cents, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(uid('ele'), esc.id, 'FUNDED', payment.amount_tzs, payment.amount_usd_cents, `Verified payment ${parsed.data.providerReference}`, now);

        createNotification(
          db,
          order.customer_id,
          'Payment Confirmed',
          `Payment ${parsed.data.providerReference} confirmed for order ${order.order_number}. Funds held safely in Corelink Escrow.`
        );
        const merch = db.prepare('SELECT user_id FROM merchants WHERE id = ?').get(order.merchant_id) as { user_id: string };
        createNotification(
          db,
          merch.user_id,
          'New Funded Order Received',
          `Order ${order.order_number} is Escrow Funded and ready for packing & inspection.`
        );
      } else {
        db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?').run('Awaiting Payment', now, order.id);
      }
      logAudit(db, null, 'PAYMENT_WEBHOOK_PROCESSED', 'payment', payment.id, parsed.data);
    });
    tx();

    res.json({ acknowledged: true, status: parsed.data.status });
  });

  // =========================================================
  // 5. ORDERS, TRACKING, INVOICES, WISHLIST, ADDRESSES, RETURNS
  // =========================================================
  router.get('/ecommerce/orders', requireAuth, (req: AuthedRequest, res) => {
    const orders = db
      .prepare(
        `SELECT o.*, oc.tax_rule_code, oc.vat_tzs, oc.vat_usd_cents, m.business_name as merchant_name,
                s.tracking_reference, s.status as shipment_status, inv.invoice_number
         FROM orders o
         LEFT JOIN order_calculations oc ON oc.order_id = o.id
         LEFT JOIN merchants m ON m.id = o.merchant_id
         LEFT JOIN shipments s ON s.order_id = o.id
         LEFT JOIN invoices inv ON inv.order_id = o.id
         WHERE o.customer_id = ?
         ORDER BY o.created_at DESC`
      )
      .all(req.auth!.userId);
    res.json({ orders });
  });

  router.get('/ecommerce/orders/:id', requireAuth, (req: AuthedRequest, res) => {
    const order = db.prepare('SELECT * FROM orders WHERE id = ? OR order_number = ?').get(req.params.id, req.params.id) as
      | { id: string; customer_id: string; merchant_id: string }
      | undefined;
    if (!order) {
      res.status(404).json({ error: 'Order not found.' });
      return;
    }
    const merch = db.prepare('SELECT user_id FROM merchants WHERE id = ?').get(order.merchant_id) as { user_id: string } | undefined;
    const allowed =
      req.auth!.role === 'admin' ||
      req.auth!.role === 'operations' ||
      order.customer_id === req.auth!.userId ||
      (merch && merch.user_id === req.auth!.userId);
    if (!allowed) {
      res.status(403).json({ error: 'Forbidden: you do not have access to this order.' });
      return;
    }

    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
    const address = db.prepare('SELECT * FROM order_addresses WHERE order_id = ?').get(order.id);
    const calculation = db.prepare('SELECT * FROM order_calculations WHERE order_id = ?').get(order.id);
    const payments = db.prepare('SELECT * FROM payments WHERE order_id = ? ORDER BY created_at DESC').all(order.id);
    const escrow = db.prepare('SELECT * FROM escrow_accounts WHERE order_id = ?').get(order.id) as { id: string } | undefined;
    const escrowEntries = escrow
      ? db.prepare('SELECT * FROM escrow_ledger_entries WHERE escrow_account_id = ? ORDER BY created_at ASC').all(escrow.id)
      : [];
    const shipment = db.prepare('SELECT * FROM shipments WHERE order_id = ?').get(order.id) as { id: string } | undefined;
    const shipmentEvents = shipment
      ? db.prepare('SELECT * FROM shipment_events WHERE shipment_id = ? ORDER BY created_at ASC').all(shipment.id)
      : [];
    const otp = shipment
      ? db.prepare('SELECT otp_hint, verified, verified_at FROM delivery_otps WHERE shipment_id = ?').get(shipment.id)
      : null;
    const invoice = db.prepare('SELECT * FROM invoices WHERE order_id = ?').get(order.id);
    const merchant = db.prepare('SELECT id, business_name, tin_number, city, country FROM merchants WHERE id = ?').get(order.merchant_id);
    const buyer = db.prepare('SELECT id, full_name, email, phone, tin_number FROM profiles WHERE id = ?').get(order.customer_id);

    res.json({
      order,
      items,
      address,
      calculation,
      payments,
      escrow,
      escrowEntries,
      shipment,
      shipmentEvents,
      otp,
      invoice,
      merchant,
      buyer,
    });
  });

  router.get('/ecommerce/orders/:id/tracking', (req: AuthedRequest, res) => {
    const order = db
      .prepare('SELECT id, order_number, status, corridor_code, incoterm, destination_zone, created_at FROM orders WHERE id = ? OR order_number = ?')
      .get(req.params.id, req.params.id) as { id: string; order_number: string } | undefined;
    if (!order) {
      res.status(404).json({ error: 'Order or tracking reference not found.' });
      return;
    }
    const shipment = db.prepare('SELECT id, corridor_code, tracking_reference, status, packed_inspected, shipping_doc_url, updated_at FROM shipments WHERE order_id = ?').get(
      order.id
    ) as { id: string } | undefined;
    const events = shipment
      ? db.prepare('SELECT id, milestone, location, notes, created_at FROM shipment_events WHERE shipment_id = ? ORDER BY created_at ASC').all(shipment.id)
      : [];
    const otp = shipment
      ? db.prepare('SELECT otp_hint, verified, verified_at FROM delivery_otps WHERE shipment_id = ?').get(shipment.id)
      : null;
    res.json({ order, shipment, events, otp });
  });

  router.get('/ecommerce/orders/:id/invoice', requireAuth, (req: AuthedRequest, res) => {
    const order = db.prepare('SELECT * FROM orders WHERE id = ? OR order_number = ?').get(req.params.id, req.params.id) as
      | { id: string; customer_id: string; merchant_id: string }
      | undefined;
    if (!order) {
      res.status(404).json({ error: 'Order not found.' });
      return;
    }
    const merch = db.prepare('SELECT user_id, business_name, tin_number, city, country FROM merchants WHERE id = ?').get(order.merchant_id) as {
      user_id: string;
      business_name: string;
      tin_number: string;
      city: string;
      country: string;
    };
    if (req.auth!.role !== 'admin' && order.customer_id !== req.auth!.userId && merch.user_id !== req.auth!.userId) {
      res.status(403).json({ error: 'Forbidden.' });
      return;
    }
    const invoice = db.prepare('SELECT * FROM invoices WHERE order_id = ?').get(order.id);
    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
    const calculation = db.prepare('SELECT * FROM order_calculations WHERE order_id = ?').get(order.id);
    const address = db.prepare('SELECT * FROM order_addresses WHERE order_id = ?').get(order.id);
    const buyer = db.prepare('SELECT full_name, email, phone, tin_number FROM profiles WHERE id = ?').get(order.customer_id);
    res.json({
      order,
      invoice,
      items,
      calculation,
      address,
      merchant: merch,
      buyer,
      fiscalNotice: 'Commercial Order Invoice only. Official fiscal tax receipts are issued solely through an approved TRA EFD integration.',
    });
  });

  router.post('/ecommerce/orders/:id/returns', requireAuth, (req: AuthedRequest, res) => {
    const reason = String(req.body?.reason ?? '').trim();
    if (reason.length < 5) {
      res.status(400).json({ error: 'Please provide a return reason (at least 5 characters).' });
      return;
    }
    const order = db.prepare('SELECT id, customer_id, total_tzs, total_usd_cents FROM orders WHERE id = ? AND customer_id = ?').get(
      req.params.id,
      req.auth!.userId
    ) as { id: string; total_tzs: number; total_usd_cents: number } | undefined;
    if (!order) {
      res.status(404).json({ error: 'Order not found.' });
      return;
    }
    const now = new Date().toISOString();
    const retId = uid('ret');
    const refId = uid('ref');
    const tx = db.transaction(() => {
      db.prepare('INSERT INTO return_requests (id, order_id, user_id, reason, status, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
        retId,
        order.id,
        req.auth!.userId,
        reason,
        'requested',
        now
      );
      db.prepare(
        'INSERT INTO refund_requests (id, order_id, return_request_id, amount_tzs, amount_usd_cents, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(refId, order.id, retId, order.total_tzs, order.total_usd_cents, 'pending', now, now);
      logAudit(db, req.auth!.userId, 'RETURN_REQUESTED', 'order', order.id, { reason });
    });
    tx();
    res.status(201).json({ returnRequestId: retId, refundRequestId: refId });
  });

  // Wishlist
  router.get('/ecommerce/wishlist', requireAuth, (req: AuthedRequest, res) => {
    let wl = db.prepare('SELECT id FROM wishlists WHERE user_id = ?').get(req.auth!.userId) as { id: string } | undefined;
    if (!wl) {
      const id = uid('wl');
      db.prepare('INSERT INTO wishlists (id, user_id, created_at) VALUES (?, ?, ?)').run(id, req.auth!.userId, new Date().toISOString());
      wl = { id };
    }
    const items = db.prepare('SELECT product_id FROM wishlist_items WHERE wishlist_id = ?').all(wl.id) as Array<{ product_id: string }>;
    const products = hydrateProducts(db, 'WHERE p.is_active = 1').filter((p) => items.some((i) => i.product_id === p.id));
    res.json({ productIds: items.map((i) => i.product_id), products });
  });

  router.post('/ecommerce/wishlist', requireAuth, (req: AuthedRequest, res) => {
    const productId = String(req.body?.productId ?? '');
    if (!productId) {
      res.status(400).json({ error: 'productId is required.' });
      return;
    }
    let wl = db.prepare('SELECT id FROM wishlists WHERE user_id = ?').get(req.auth!.userId) as { id: string } | undefined;
    if (!wl) {
      const id = uid('wl');
      db.prepare('INSERT INTO wishlists (id, user_id, created_at) VALUES (?, ?, ?)').run(id, req.auth!.userId, new Date().toISOString());
      wl = { id };
    }
    db.prepare('INSERT OR IGNORE INTO wishlist_items (id, wishlist_id, product_id, created_at) VALUES (?, ?, ?, ?)').run(
      uid('wli'),
      wl.id,
      productId,
      new Date().toISOString()
    );
    res.status(201).json({ added: true });
  });

  router.delete('/ecommerce/wishlist/:productId', requireAuth, (req: AuthedRequest, res) => {
    const wl = db.prepare('SELECT id FROM wishlists WHERE user_id = ?').get(req.auth!.userId) as { id: string } | undefined;
    if (wl) {
      db.prepare('DELETE FROM wishlist_items WHERE wishlist_id = ? AND product_id = ?').run(wl.id, req.params.productId);
    }
    res.json({ removed: true });
  });

  // Addresses
  router.get('/ecommerce/addresses', requireAuth, (req: AuthedRequest, res) => {
    const addresses = db
      .prepare('SELECT * FROM customer_addresses WHERE user_id = ? ORDER BY is_default DESC, created_at DESC')
      .all(req.auth!.userId);
    res.json({ addresses });
  });

  router.post('/ecommerce/addresses', requireAuth, (req: AuthedRequest, res) => {
    const schema = z.object({
      label: z.string().min(1),
      recipientName: z.string().min(2),
      phone: z.string().min(5),
      country: z.string().min(2),
      regionOrCity: z.string().min(2),
      district: z.string().min(1),
      streetAddress: z.string().min(3),
      postalCode: z.string().optional(),
      isDefault: z.boolean().default(false),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Incomplete address fields.' });
      return;
    }
    const id = uid('addr');
    const now = new Date().toISOString();
    const d = parsed.data;
    if (d.isDefault) {
      db.prepare('UPDATE customer_addresses SET is_default = 0 WHERE user_id = ?').run(req.auth!.userId);
    }
    db.prepare(
      'INSERT INTO customer_addresses (id, user_id, label, recipient_name, phone, country, region_or_city, district, street_address, postal_code, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, req.auth!.userId, d.label, d.recipientName, d.phone, d.country, d.regionOrCity, d.district, d.streetAddress, d.postalCode ?? '', d.isDefault ? 1 : 0, now, now);
    res.status(201).json({ id });
  });

  router.delete('/ecommerce/addresses/:id', requireAuth, (req: AuthedRequest, res) => {
    db.prepare('DELETE FROM customer_addresses WHERE id = ? AND user_id = ?').run(req.params.id, req.auth!.userId);
    res.json({ deleted: true });
  });

  // Notifications
  router.get('/ecommerce/notifications', requireAuth, (req: AuthedRequest, res) => {
    const notifications = db
      .prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 30')
      .all(req.auth!.userId);
    res.json({ notifications });
  });

  router.patch('/ecommerce/notifications/:id/read', requireAuth, (req: AuthedRequest, res) => {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(req.params.id, req.auth!.userId);
    res.json({ read: true });
  });

  // =========================================================
  // 6. MERCHANT PORTAL
  // =========================================================
  router.post('/merchant/register', requireAuth, (req: AuthedRequest, res) => {
    const schema = z.object({
      businessName: z.string().min(3).max(160),
      registrationNumber: z.string().min(3).max(80),
      tinNumber: z.string().min(3).max(60),
      brelaNumber: z.string().optional(),
      city: z.string().min(2),
      country: z.string().default('Tanzania'),
      description: z.string().min(5),
      documentName: z.string().default('brela_tin_verification.pdf'),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid merchant application.' });
      return;
    }

    const existing = db.prepare('SELECT id FROM merchants WHERE user_id = ?').get(req.auth!.userId);
    if (existing) {
      res.status(409).json({ error: 'Merchant profile already exists for this account.' });
      return;
    }

    const d = parsed.data;
    const merchantId = uid('mrc');
    const now = new Date().toISOString();

    const tx = db.transaction(() => {
      db.prepare(
        'INSERT INTO merchants (id, user_id, business_name, registration_number, tin_number, brela_number, city, country, description, verification_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(merchantId, req.auth!.userId, d.businessName, d.registrationNumber, d.tinNumber, d.brelaNumber ?? '', d.city, d.country, d.description, 'pending', now, now);
      db.prepare(
        'INSERT INTO merchant_documents (id, merchant_id, doc_type, file_name, storage_path, review_status, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(uid('doc'), merchantId, 'BRELA & TRA TIN Bundle', d.documentName, `private/merchants/${merchantId}/${d.documentName}`, 'pending', now);
      db.prepare('INSERT OR REPLACE INTO user_roles (id, user_id, role, created_at) VALUES (?, ?, ?, ?)').run(
        `role-${req.auth!.userId}`,
        req.auth!.userId,
        'merchant',
        now
      );
      createNotification(db, req.auth!.userId, 'Merchant Application Received', `Verification application for ${d.businessName} is pending administrator review.`);
      logAudit(db, req.auth!.userId, 'MERCHANT_REGISTERED', 'merchant', merchantId, { businessName: d.businessName });
    });
    tx();

    const newToken = signSessionToken({ userId: req.auth!.userId, email: req.auth!.email, role: 'merchant' });
    res.status(201).json({ merchantId, token: newToken, verificationStatus: 'pending' });
  });

  router.get('/merchant/dashboard', requireAuth, requireRole('merchant', 'admin'), (req: AuthedRequest, res) => {
    const merchant = db.prepare('SELECT * FROM merchants WHERE user_id = ?').get(req.auth!.userId) as
      | { id: string; business_name: string; verification_status: string; tin_number: string; city: string; country: string }
      | undefined;
    if (!merchant) {
      res.status(404).json({ error: 'Merchant profile not found.' });
      return;
    }

    const docs = db.prepare('SELECT * FROM merchant_documents WHERE merchant_id = ?').all(merchant.id);
    const products = hydrateProducts(db, 'WHERE p.merchant_id = ? AND p.is_active = 1', [merchant.id]);
    const orders = db
      .prepare('SELECT * FROM orders WHERE merchant_id = ? ORDER BY created_at DESC')
      .all(merchant.id) as Array<{ id: string; status: string; total_tzs: number; total_usd_cents: number; created_at: string }>;
    const escrow = db
      .prepare('SELECT * FROM escrow_accounts WHERE merchant_id = ? ORDER BY updated_at DESC')
      .all(merchant.id) as Array<{ held_tzs: number; held_usd_cents: number; released_tzs: number; released_usd_cents: number }>;

    const totalSalesTzs = orders.reduce((s, o) => s + o.total_tzs, 0);
    const totalSalesUsdCents = orders.reduce((s, o) => s + o.total_usd_cents, 0);
    const lowStock = products.filter((p) => p.stockQty <= p.lowStockThreshold);

    res.json({
      merchant,
      docs,
      metrics: {
        totalSalesTzs,
        totalSalesUsdCents,
        totalOrders: orders.length,
        pendingOrders: orders.filter((o) => !['Completed', 'Cancelled', 'Refunded'].includes(o.status)).length,
        completedOrders: orders.filter((o) => o.status === 'Completed' || o.status === 'Delivered').length,
        productCount: products.length,
        lowStockCount: lowStock.length,
        escrowHeldTzs: escrow.reduce((s, e) => s + e.held_tzs, 0),
        escrowHeldUsdCents: escrow.reduce((s, e) => s + e.held_usd_cents, 0),
        escrowReleasedTzs: escrow.reduce((s, e) => s + e.released_tzs, 0),
        escrowReleasedUsdCents: escrow.reduce((s, e) => s + e.released_usd_cents, 0),
      },
      lowStockProducts: lowStock,
      recentOrders: orders.slice(0, 10),
    });
  });

  router.get('/merchant/products', requireAuth, requireRole('merchant', 'admin'), (req: AuthedRequest, res) => {
    const merchant = db.prepare('SELECT id FROM merchants WHERE user_id = ?').get(req.auth!.userId) as { id: string } | undefined;
    if (!merchant) {
      res.status(404).json({ error: 'Merchant not found.' });
      return;
    }
    res.json({ products: hydrateProducts(db, 'WHERE p.merchant_id = ? AND p.is_active = 1', [merchant.id]) });
  });

  router.get('/merchant/orders', requireAuth, requireRole('merchant', 'admin'), (req: AuthedRequest, res) => {
    const merchant = db.prepare('SELECT id FROM merchants WHERE user_id = ?').get(req.auth!.userId) as { id: string } | undefined;
    if (!merchant) {
      res.status(404).json({ error: 'Merchant not found.' });
      return;
    }
    const orders = db
      .prepare(
        `SELECT o.*, p.full_name as customer_name, s.tracking_reference, s.status as shipment_status
         FROM orders o
         JOIN profiles p ON p.id = o.customer_id
         LEFT JOIN shipments s ON s.order_id = o.id
         WHERE o.merchant_id = ?
         ORDER BY o.created_at DESC`
      )
      .all(merchant.id);
    res.json({ orders });
  });

  router.patch('/merchant/orders/:id/status', requireAuth, requireRole('merchant', 'admin'), (req: AuthedRequest, res) => {
    const merchant = db.prepare('SELECT id FROM merchants WHERE user_id = ?').get(req.auth!.userId) as { id: string } | undefined;
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id) as
      | { id: string; merchant_id: string; customer_id: string; order_number: string }
      | undefined;
    if (!order || (req.auth!.role === 'merchant' && (!merchant || order.merchant_id !== merchant.id))) {
      res.status(403).json({ error: 'Forbidden: cannot modify another merchant order.' });
      return;
    }
    const nextStatus = String(req.body?.status || 'Processing');
    const now = new Date().toISOString();
    db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?').run(nextStatus, now, order.id);
    if (nextStatus === 'Packed' || nextStatus === 'Inspected') {
      db.prepare('UPDATE shipments SET status = ?, packed_inspected = 1, updated_at = ? WHERE order_id = ?').run(nextStatus, now, order.id);
      const shp = db.prepare('SELECT id FROM shipments WHERE order_id = ?').get(order.id) as { id: string } | undefined;
      if (shp) {
        db.prepare('INSERT INTO shipment_events (id, shipment_id, milestone, location, notes, actor_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
          uid('se'),
          shp.id,
          nextStatus,
          'Merchant Warehouse',
          `Order marked ${nextStatus} by seller`,
          req.auth!.userId,
          now
        );
      }
      createNotification(db, order.customer_id, `Order ${nextStatus}`, `Order ${order.order_number} has been ${nextStatus.toLowerCase()}.`);
    }
    res.json({ updated: true, status: nextStatus });
  });

  // =========================================================
  // 7. OPERATIONS / LOGISTICS PORTAL
  // =========================================================
  router.get('/operations/shipments', requireAuth, requireRole('operations', 'admin'), (_req, res) => {
    const shipments = db
      .prepare(
        `SELECT s.*, o.order_number, o.status as order_status, o.destination_zone, o.incoterm, o.total_tzs, o.total_usd_cents,
                oa.recipient_name, oa.phone, oa.street_address, otp.otp_hint, otp.verified as otp_verified
         FROM shipments s
         JOIN orders o ON o.id = s.order_id
         LEFT JOIN order_addresses oa ON oa.order_id = o.id
         LEFT JOIN delivery_otps otp ON otp.shipment_id = s.id
         ORDER BY s.updated_at DESC`
      )
      .all();
    res.json({ shipments });
  });

  router.patch('/operations/shipments/:id', requireAuth, requireRole('operations', 'admin'), (req: AuthedRequest, res) => {
    const schema = z.object({
      status: z.enum(['Awaiting Packing', 'Packed', 'Inspected', 'Dispatched', 'In Transit', 'Delivered']),
      location: z.string().min(2),
      notes: z.string().default(''),
      trackingReference: z.string().optional(),
      shippingDocUrl: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid shipment update payload.' });
      return;
    }

    const shp = db.prepare('SELECT * FROM shipments WHERE id = ?').get(req.params.id) as
      | { id: string; order_id: string; tracking_reference: string; shipping_doc_url: string | null }
      | undefined;
    if (!shp) {
      res.status(404).json({ error: 'Shipment not found.' });
      return;
    }

    const d = parsed.data;
    const now = new Date().toISOString();
    const order = db.prepare('SELECT id, customer_id, order_number FROM orders WHERE id = ?').get(shp.order_id) as {
      id: string;
      customer_id: string;
      order_number: string;
    };

    const tx = db.transaction(() => {
      db.prepare(
        'UPDATE shipments SET status = ?, packed_inspected = CASE WHEN ? IN (\'Packed\', \'Inspected\', \'Dispatched\', \'In Transit\', \'Delivered\') THEN 1 ELSE packed_inspected END, tracking_reference = ?, shipping_doc_url = ?, updated_at = ? WHERE id = ?'
      ).run(d.status, d.status, d.trackingReference || shp.tracking_reference, d.shippingDocUrl ?? shp.shipping_doc_url, now, shp.id);

      db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?').run(d.status, now, order.id);

      db.prepare(
        'INSERT INTO shipment_events (id, shipment_id, milestone, location, notes, actor_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(uid('se'), shp.id, d.status, d.location, d.notes, req.auth!.userId, now);

      const escState =
        d.status === 'Packed' || d.status === 'Inspected'
          ? 'Packed and inspected'
          : d.status === 'Dispatched' || d.status === 'In Transit'
          ? 'In transit'
          : d.status === 'Delivered'
          ? 'Delivered'
          : null;
      if (escState) {
        db.prepare('UPDATE escrow_accounts SET state = ?, updated_at = ? WHERE order_id = ?').run(escState, now, order.id);
      }

      createNotification(db, order.customer_id, `Shipment ${d.status}`, `Order ${order.order_number} milestone updated: ${d.status} at ${d.location}.`);
      logAudit(db, req.auth!.userId, 'SHIPMENT_MILESTONE_UPDATED', 'shipment', shp.id, d);
    });
    tx();

    res.json({ updated: true, status: d.status });
  });

  router.post('/operations/shipments/:id/verify-otp', requireAuth, requireRole('operations', 'admin'), (req: AuthedRequest, res) => {
    const otpCode = String(req.body?.otpCode ?? '').trim();
    if (!otpCode) {
      res.status(400).json({ error: 'Delivery OTP code is required.' });
      return;
    }

    const shp = db.prepare('SELECT * FROM shipments WHERE id = ?').get(req.params.id) as
      | { id: string; order_id: string; corridor_code: string }
      | undefined;
    if (!shp) {
      res.status(404).json({ error: 'Shipment not found.' });
      return;
    }

    const otpRow = db.prepare('SELECT * FROM delivery_otps WHERE shipment_id = ?').get(shp.id) as
      | { id: string; otp_hash: string; verified: number }
      | undefined;
    if (!otpRow) {
      res.status(404).json({ error: 'OTP record missing for shipment.' });
      return;
    }
    if (!verifyPassword(otpCode, otpRow.otp_hash)) {
      res.status(400).json({ error: 'Delivery OTP verification failed. Incorrect code.' });
      return;
    }

    const now = new Date().toISOString();
    const order = db.prepare('SELECT id, customer_id, order_number FROM orders WHERE id = ?').get(shp.order_id) as {
      id: string;
      customer_id: string;
      order_number: string;
    };

    const tx = db.transaction(() => {
      db.prepare('UPDATE delivery_otps SET verified = 1, verified_at = ? WHERE id = ?').run(now, otpRow.id);
      db.prepare('UPDATE shipments SET status = ?, updated_at = ? WHERE id = ?').run('Delivered', now, shp.id);
      db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?').run('Delivered', now, order.id);
      db.prepare(
        'INSERT INTO shipment_events (id, shipment_id, milestone, location, notes, actor_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(uid('se'), shp.id, 'Delivery OTP Verified', 'Customer Handover Point', 'Recipient OTP verified; escrow marked eligible for release.', req.auth!.userId, now);
      db.prepare('UPDATE escrow_accounts SET state = ?, updated_at = ? WHERE order_id = ?').run('Verified', now, order.id);
      createNotification(db, order.customer_id, 'Order Delivered & Verified', `Order ${order.order_number} delivery OTP confirmed.`);
      logAudit(db, req.auth!.userId, 'DELIVERY_OTP_VERIFIED', 'shipment', shp.id, { orderId: order.id });
    });
    tx();

    res.json({ verified: true, escrowState: 'Verified' });
  });

  // =========================================================
  // 8. ADMIN PORTAL
  // =========================================================
  router.get('/admin/dashboard', requireAuth, requireRole('admin'), (_req, res) => {
    const orders = db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all() as Array<{
      id: string;
      order_number: string;
      status: string;
      total_tzs: number;
      total_usd_cents: number;
      corridor_code: string;
      created_at: string;
    }>;
    const customers = db.prepare("SELECT COUNT(*) as c FROM user_roles WHERE role = 'customer'").get() as { c: number };
    const merchants = db.prepare('SELECT * FROM merchants').all() as Array<{ id: string; verification_status: string }>;
    const products = db
      .prepare('SELECT p.id, p.name, inv.stock_qty, inv.low_stock_threshold FROM products p JOIN inventory inv ON inv.product_id = p.id WHERE p.is_active = 1')
      .all() as Array<{ id: string; name: string; stock_qty: number; low_stock_threshold: number }>;
    const pendingPayments = db.prepare("SELECT COUNT(*) as c FROM payments WHERE status IN ('pending','awaiting_reconciliation','requires_action')").get() as { c: number };
    const escrow = db.prepare('SELECT SUM(held_tzs) as held_tzs, SUM(held_usd_cents) as held_usd, SUM(released_tzs) as rel_tzs, SUM(released_usd_cents) as rel_usd FROM escrow_accounts').get() as {
      held_tzs: number | null;
      held_usd: number | null;
      rel_tzs: number | null;
      rel_usd: number | null;
    };
    const refundsPending = db.prepare("SELECT COUNT(*) as c FROM refund_requests WHERE status = 'pending'").get() as { c: number };
    const recentPayments = db
      .prepare(
        `SELECT p.*, o.order_number FROM payments p JOIN orders o ON o.id = p.order_id ORDER BY p.created_at DESC LIMIT 10`
      )
      .all();

    res.json({
      metrics: {
        totalRevenueTzs: orders.reduce((s, o) => s + o.total_tzs, 0),
        totalRevenueUsdCents: orders.reduce((s, o) => s + o.total_usd_cents, 0),
        totalOrders: orders.length,
        pendingOrders: orders.filter((o) => !['Completed', 'Cancelled', 'Refunded'].includes(o.status)).length,
        completedOrders: orders.filter((o) => o.status === 'Completed' || o.status === 'Delivered').length,
        totalCustomers: customers.c,
        totalMerchants: merchants.length,
        verifiedMerchants: merchants.filter((m) => m.verification_status === 'approved').length,
        pendingMerchantApprovals: merchants.filter((m) => m.verification_status === 'pending').length,
        totalProducts: products.length,
        lowStockCount: products.filter((p) => p.stock_qty <= p.low_stock_threshold).length,
        pendingPayments: pendingPayments.c,
        escrowHeldTzs: escrow.held_tzs ?? 0,
        escrowHeldUsdCents: escrow.held_usd ?? 0,
        escrowReleasedTzs: escrow.rel_tzs ?? 0,
        escrowReleasedUsdCents: escrow.rel_usd ?? 0,
        pendingRefunds: refundsPending.c,
      },
      lowStockProducts: products.filter((p) => p.stock_qty <= p.low_stock_threshold),
      recentOrders: orders.slice(0, 8),
      recentPayments,
      fx: getActiveFx(db),
    });
  });

  router.get('/admin/orders', requireAuth, requireRole('admin'), (_req, res) => {
    const orders = db
      .prepare(
        `SELECT o.*, p.full_name as customer_name, m.business_name as merchant_name, s.tracking_reference, s.status as shipment_status
         FROM orders o
         JOIN profiles p ON p.id = o.customer_id
         JOIN merchants m ON m.id = o.merchant_id
         LEFT JOIN shipments s ON s.order_id = o.id
         ORDER BY o.created_at DESC`
      )
      .all();
    res.json({ orders });
  });

  router.get('/admin/merchants', requireAuth, requireRole('admin'), (_req, res) => {
    const merchants = db
      .prepare(
        `SELECT m.*, p.email, p.full_name, p.phone, p.status as user_status
         FROM merchants m
         JOIN profiles p ON p.id = m.user_id
         ORDER BY m.created_at DESC`
      )
      .all() as Array<Record<string, unknown>>;
    const docStmt = db.prepare('SELECT * FROM merchant_documents WHERE merchant_id = ?');
    res.json({
      merchants: merchants.map((m) => ({
        ...m,
        documents: docStmt.all(m.id as string),
      })),
    });
  });

  router.patch('/admin/merchants/:id/verification', requireAuth, requireRole('admin'), (req: AuthedRequest, res) => {
    const status = req.body?.status;
    if (!['approved', 'rejected', 'suspended', 'pending'].includes(status)) {
      res.status(400).json({ error: 'Invalid verification status.' });
      return;
    }
    const merchant = db.prepare('SELECT * FROM merchants WHERE id = ?').get(req.params.id) as
      | { id: string; user_id: string; business_name: string }
      | undefined;
    if (!merchant) {
      res.status(404).json({ error: 'Merchant not found.' });
      return;
    }
    const now = new Date().toISOString();
    db.prepare('UPDATE merchants SET verification_status = ?, verified_at = ?, updated_at = ? WHERE id = ?').run(
      status,
      status === 'approved' ? now : null,
      now,
      merchant.id
    );
    db.prepare('UPDATE merchant_documents SET review_status = ? WHERE merchant_id = ?').run(
      status === 'approved' ? 'approved' : status === 'rejected' ? 'rejected' : 'pending',
      merchant.id
    );
    createNotification(
      db,
      merchant.user_id,
      `Merchant Verification ${status.toUpperCase()}`,
      `${merchant.business_name} verification status updated to ${status}.`
    );
    logAudit(db, req.auth!.userId, 'MERCHANT_VERIFICATION_UPDATED', 'merchant', merchant.id, { status });
    res.json({ updated: true, verificationStatus: status });
  });

  router.get('/admin/users', requireAuth, requireRole('admin'), (_req, res) => {
    const users = db
      .prepare(
        `SELECT p.id, p.email, p.full_name, p.phone, p.email_verified, p.preferred_currency, p.tax_profile, p.status, p.created_at, ur.role
         FROM profiles p
         LEFT JOIN user_roles ur ON ur.user_id = p.id
         ORDER BY p.created_at DESC`
      )
      .all();
    res.json({ users });
  });

  router.patch('/admin/users/:id/status', requireAuth, requireRole('admin'), (req: AuthedRequest, res) => {
    const status = req.body?.status;
    if (status !== 'active' && status !== 'suspended') {
      res.status(400).json({ error: 'Status must be active or suspended.' });
      return;
    }
    db.prepare('UPDATE profiles SET status = ?, updated_at = ? WHERE id = ?').run(status, new Date().toISOString(), req.params.id);
    logAudit(db, req.auth!.userId, 'USER_STATUS_UPDATED', 'profile', req.params.id, { status });
    res.json({ updated: true, status });
  });

  router.get('/admin/fx', requireAuth, requireRole('admin'), (_req, res) => {
    res.json({ current: getActiveFx(db), history: db.prepare('SELECT * FROM exchange_rates ORDER BY created_at DESC LIMIT 20').all() });
  });

  router.post('/admin/fx', requireAuth, requireRole('admin'), (req: AuthedRequest, res) => {
    const midRate = Number(req.body?.midRate);
    const spreadBps = Number(req.body?.spreadBps ?? 120);
    const source = String(req.body?.source || 'Manual Admin Update');
    if (!Number.isFinite(midRate) || midRate <= 100 || !Number.isFinite(spreadBps) || spreadBps < 0) {
      res.status(400).json({ error: 'Valid midRate and spreadBps are required.' });
      return;
    }
    const effective = effectiveRateScaledToNumber(computeEffectiveRateScaled(midRate, spreadBps));
    const now = new Date().toISOString();
    const id = uid('fx');
    const tx = db.transaction(() => {
      db.prepare('UPDATE exchange_rates SET is_active = 0 WHERE is_active = 1').run();
      db.prepare(
        'INSERT INTO exchange_rates (id, base_currency, quote_currency, mid_rate, spread_bps, effective_rate, source, is_fallback, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1, ?)'
      ).run(id, 'USD', 'TZS', midRate, Math.round(spreadBps), effective, source, now);
      logAudit(db, req.auth!.userId, 'FX_RATE_UPDATED', 'exchange_rate', id, { midRate, spreadBps, effective, source });
    });
    tx();
    res.status(201).json({ current: getActiveFx(db) });
  });

  router.get('/admin/taxes', requireAuth, requireRole('admin'), (_req, res) => {
    res.json({ taxRules: getTaxRules(db) });
  });

  router.patch('/admin/taxes', requireAuth, requireRole('admin'), (req: AuthedRequest, res) => {
    const schema = z.array(
      z.object({
        id: z.string(),
        code: z.enum(['TAX-TZ-STD', 'TAX-TZ-DIG', 'TAX-EXP-00', 'TAX-EXEMPT']),
        name: z.string(),
        rateBps: z.number().int().min(0).max(5000),
        appliesToLogistics: z.boolean(),
        requiresExportDocs: z.boolean(),
        requiresExemptionDocs: z.boolean(),
        description: z.string(),
        active: z.boolean(),
      })
    );
    const parsed = schema.safeParse(req.body?.taxRules);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid tax rules payload.' });
      return;
    }
    db.prepare('INSERT OR REPLACE INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, ?)').run(
      'tax_rules',
      JSON.stringify(parsed.data),
      new Date().toISOString()
    );
    logAudit(db, req.auth!.userId, 'TAX_RULES_UPDATED', 'platform_settings', 'tax_rules');
    res.json({ taxRules: parsed.data });
  });

  router.get('/admin/corridors', requireAuth, requireRole('admin'), (_req, res) => {
    res.json({ corridors: getCorridors(db) });
  });

  router.patch('/admin/corridors/:id', requireAuth, requireRole('admin'), (req: AuthedRequest, res) => {
    const rateRow = db.prepare('SELECT * FROM shipping_rates WHERE corridor_id = ?').get(req.params.id) as
      | {
          id: string;
          base_rate_minor: number;
          per_kg_rate_minor: number;
          insurance_rate_bps: number;
          sea_lcl_per_cbm_usd_cents: number;
          sea_fcl_20ft_usd_cents: number;
        }
      | undefined;
    if (!rateRow) {
      res.status(404).json({ error: 'Corridor not found.' });
      return;
    }
    const now = new Date().toISOString();
    db.prepare(
      'UPDATE shipping_rates SET base_rate_minor = ?, per_kg_rate_minor = ?, insurance_rate_bps = ?, sea_lcl_per_cbm_usd_cents = ?, sea_fcl_20ft_usd_cents = ?, updated_at = ? WHERE corridor_id = ?'
    ).run(
      typeof req.body.baseRateMinor === 'number' ? Math.round(req.body.baseRateMinor) : rateRow.base_rate_minor,
      typeof req.body.perKgRateMinor === 'number' ? Math.round(req.body.perKgRateMinor) : rateRow.per_kg_rate_minor,
      typeof req.body.insuranceRateBps === 'number' ? Math.round(req.body.insuranceRateBps) : rateRow.insurance_rate_bps,
      typeof req.body.seaLclPerCbmUsdCents === 'number' ? Math.round(req.body.seaLclPerCbmUsdCents) : rateRow.sea_lcl_per_cbm_usd_cents,
      typeof req.body.seaFcl20ftUsdCents === 'number' ? Math.round(req.body.seaFcl20ftUsdCents) : rateRow.sea_fcl_20ft_usd_cents,
      now,
      req.params.id
    );
    logAudit(db, req.auth!.userId, 'CORRIDOR_RATES_UPDATED', 'shipping_corridor', req.params.id, req.body);
    res.json({ corridors: getCorridors(db) });
  });

  router.get('/admin/coupons', requireAuth, requireRole('admin'), (_req, res) => {
    res.json({ coupons: db.prepare('SELECT * FROM coupons ORDER BY created_at DESC').all() });
  });

  router.post('/admin/coupons', requireAuth, requireRole('admin'), (req: AuthedRequest, res) => {
    const schema = z.object({
      code: z.string().min(3).max(30),
      discountType: z.enum(['percentage', 'fixed']),
      discountValue: z.number().int().positive(),
      currency: z.enum(['TZS', 'USD']).default('USD'),
      minPurchaseMinor: z.number().int().min(0).default(0),
      maxDiscountMinor: z.number().int().positive().nullable().default(null),
      usageLimit: z.number().int().positive().nullable().default(100),
      eligibleSegment: z.enum(['all', 'retail', 'wholesale']).default('all'),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid coupon configuration.' });
      return;
    }
    const id = uid('cpn');
    const d = parsed.data;
    db.prepare(
      'INSERT INTO coupons (id, code, discount_type, discount_value, currency, min_purchase_minor, max_discount_minor, usage_limit, used_count, eligible_segment, expires_at, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 1, ?)'
    ).run(id, d.code.toUpperCase(), d.discountType, d.discountValue, d.currency, d.minPurchaseMinor, d.maxDiscountMinor, d.usageLimit, d.eligibleSegment, '2027-12-31T23:59:59Z', new Date().toISOString());
    res.status(201).json({ id });
  });

  router.patch('/admin/coupons/:id', requireAuth, requireRole('admin'), (req, res) => {
    db.prepare('UPDATE coupons SET active = ? WHERE id = ?').run(req.body.active ? 1 : 0, req.params.id);
    res.json({ updated: true });
  });

  router.get('/admin/payments', requireAuth, requireRole('admin'), (_req, res) => {
    const payments = db
      .prepare('SELECT p.*, o.order_number, o.customer_id FROM payments p JOIN orders o ON o.id = p.order_id ORDER BY p.created_at DESC')
      .all();
    res.json({ payments });
  });

  router.post('/admin/payments/:id/reconcile', requireAuth, requireRole('admin'), (req: AuthedRequest, res) => {
    const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.id) as
      | { id: string; order_id: string; amount_tzs: number; amount_usd_cents: number; provider_reference: string; status: string }
      | undefined;
    if (!payment) {
      res.status(404).json({ error: 'Payment not found.' });
      return;
    }
    const decision = req.body?.decision === 'reject' ? 'failed' : 'confirmed';
    const now = new Date().toISOString();
    const order = db.prepare('SELECT id, order_number, customer_id, merchant_id FROM orders WHERE id = ?').get(payment.order_id) as {
      id: string;
      order_number: string;
      customer_id: string;
      merchant_id: string;
    };

    const tx = db.transaction(() => {
      db.prepare('UPDATE payments SET status = ?, updated_at = ? WHERE id = ?').run(decision, now, payment.id);
      db.prepare('INSERT INTO payment_events (id, payment_id, event_type, payload_json, created_at) VALUES (?, ?, ?, ?, ?)').run(
        uid('pe'),
        payment.id,
        `ADMIN_RECONCILE_${decision.toUpperCase()}`,
        JSON.stringify({ adminId: req.auth!.userId }),
        now
      );
      if (decision === 'confirmed') {
        db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?').run('Escrow Funded', now, order.id);
        db.prepare('UPDATE shipments SET status = ?, updated_at = ? WHERE order_id = ?').run('Awaiting Packing', now, order.id);
        const esc = db.prepare('SELECT id FROM escrow_accounts WHERE order_id = ?').get(order.id) as { id: string };
        db.prepare('UPDATE escrow_accounts SET state = ?, held_tzs = ?, held_usd_cents = ?, updated_at = ? WHERE id = ?').run(
          'Escrow held',
          payment.amount_tzs,
          payment.amount_usd_cents,
          now,
          esc.id
        );
        db.prepare(
          'INSERT INTO escrow_ledger_entries (id, escrow_account_id, entry_type, amount_tzs, amount_usd_cents, note, actor_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(uid('ele'), esc.id, 'BANK_RECONCILED', payment.amount_tzs, payment.amount_usd_cents, `Bank transfer reconciled (${payment.provider_reference})`, req.auth!.userId, now);
        createNotification(db, order.customer_id, 'Bank Transfer Reconciled', `Order ${order.order_number} payment verified.`);
      }
      logAudit(db, req.auth!.userId, 'PAYMENT_RECONCILED', 'payment', payment.id, { decision });
    });
    tx();
    res.json({ updated: true, status: decision });
  });

  router.get('/admin/escrow', requireAuth, requireRole('admin'), (_req, res) => {
    const accounts = db
      .prepare(
        `SELECT e.*, o.order_number, o.corridor_code, o.status as order_status, m.business_name as merchant_name
         FROM escrow_accounts e
         JOIN orders o ON o.id = e.order_id
         JOIN merchants m ON m.id = e.merchant_id
         ORDER BY e.updated_at DESC`
      )
      .all();
    const entries = db
      .prepare(
        `SELECT ele.*, o.order_number
         FROM escrow_ledger_entries ele
         JOIN escrow_accounts e ON e.id = ele.escrow_account_id
         JOIN orders o ON o.id = e.order_id
         ORDER BY ele.created_at DESC LIMIT 40`
      )
      .all();
    res.json({ accounts, entries });
  });

  router.post('/admin/escrow/:id/release', requireAuth, requireRole('admin'), (req: AuthedRequest, res) => {
    const esc = db.prepare('SELECT * FROM escrow_accounts WHERE id = ?').get(req.params.id) as
      | { id: string; order_id: string; merchant_id: string; held_tzs: number; held_usd_cents: number; state: string }
      | undefined;
    if (!esc) {
      res.status(404).json({ error: 'Escrow account not found.' });
      return;
    }
    const shp = db.prepare('SELECT s.*, otp.verified as otp_verified FROM shipments s LEFT JOIN delivery_otps otp ON otp.shipment_id = s.id WHERE s.order_id = ?').get(
      esc.order_id
    ) as { corridor_code: string; shipping_doc_url: string | null; otp_verified: number } | undefined;

    // Enforce domestic OTP verification OR export shipping-doc verification
    if (shp && (shp.corridor_code === 'LOG-01' || shp.corridor_code === 'LOG-02') && !shp.otp_verified) {
      res.status(400).json({ error: 'Domestic escrow release requires verified delivery OTP.' });
      return;
    }
    if (shp && (shp.corridor_code === 'LOG-03' || shp.corridor_code === 'LOG-04') && !shp.shipping_doc_url && !shp.otp_verified) {
      res.status(400).json({ error: 'Export escrow release requires verified shipping documentation or POD.' });
      return;
    }

    const now = new Date().toISOString();
    const tx = db.transaction(() => {
      db.prepare('UPDATE escrow_accounts SET state = ?, held_tzs = 0, held_usd_cents = 0, released_tzs = released_tzs + ?, released_usd_cents = released_usd_cents + ?, updated_at = ? WHERE id = ?').run(
        'Released',
        esc.held_tzs,
        esc.held_usd_cents,
        now,
        esc.id
      );
      db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?').run('Completed', now, esc.order_id);
      db.prepare(
        'INSERT INTO escrow_ledger_entries (id, escrow_account_id, entry_type, amount_tzs, amount_usd_cents, note, actor_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(uid('ele'), esc.id, 'RELEASED', esc.held_tzs, esc.held_usd_cents, 'Milestone verified; settlement released to merchant ledger', req.auth!.userId, now);
      logAudit(db, req.auth!.userId, 'ESCROW_RELEASED', 'escrow_account', esc.id, { orderId: esc.order_id });
    });
    tx();
    res.json({ released: true });
  });

  router.get('/admin/refunds', requireAuth, requireRole('admin'), (_req, res) => {
    const refunds = db
      .prepare(
        `SELECT rr.*, o.order_number, ret.reason
         FROM refund_requests rr
         JOIN orders o ON o.id = rr.order_id
         LEFT JOIN return_requests ret ON ret.id = rr.return_request_id
         ORDER BY rr.created_at DESC`
      )
      .all();
    res.json({ refunds });
  });

  router.patch('/admin/refunds/:id', requireAuth, requireRole('admin'), (req: AuthedRequest, res) => {
    const decision = req.body?.status === 'rejected' ? 'rejected' : 'approved';
    const ref = db.prepare('SELECT * FROM refund_requests WHERE id = ?').get(req.params.id) as
      | { id: string; order_id: string; return_request_id: string | null; amount_tzs: number; amount_usd_cents: number }
      | undefined;
    if (!ref) {
      res.status(404).json({ error: 'Refund request not found.' });
      return;
    }
    const now = new Date().toISOString();
    const tx = db.transaction(() => {
      db.prepare('UPDATE refund_requests SET status = ?, reviewed_by = ?, updated_at = ? WHERE id = ?').run(decision, req.auth!.userId, now, ref.id);
      if (ref.return_request_id) {
        db.prepare('UPDATE return_requests SET status = ? WHERE id = ?').run(decision, ref.return_request_id);
      }
      if (decision === 'approved') {
        db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?').run('Refunded', now, ref.order_id);
        const esc = db.prepare('SELECT id FROM escrow_accounts WHERE order_id = ?').get(ref.order_id) as { id: string } | undefined;
        if (esc) {
          db.prepare('UPDATE escrow_accounts SET state = ?, held_tzs = 0, held_usd_cents = 0, updated_at = ? WHERE id = ?').run('Refunded', now, esc.id);
          db.prepare(
            'INSERT INTO escrow_ledger_entries (id, escrow_account_id, entry_type, amount_tzs, amount_usd_cents, note, actor_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
          ).run(uid('ele'), esc.id, 'REFUNDED', ref.amount_tzs, ref.amount_usd_cents, 'Refund approved by platform administration', req.auth!.userId, now);
        }
      }
      logAudit(db, req.auth!.userId, 'REFUND_REVIEWED', 'refund_request', ref.id, { decision });
    });
    tx();
    res.json({ updated: true, status: decision });
  });

  router.get('/admin/settings', requireAuth, requireRole('admin'), (_req, res) => {
    const row = db.prepare('SELECT value_json FROM platform_settings WHERE key = ?').get('platform_config') as
      | { value_json: string }
      | undefined;
    res.json({ settings: row ? JSON.parse(row.value_json) : {} });
  });

  router.patch('/admin/settings', requireAuth, requireRole('admin'), (req: AuthedRequest, res) => {
    const row = db.prepare('SELECT value_json FROM platform_settings WHERE key = ?').get('platform_config') as
      | { value_json: string }
      | undefined;
    const merged = { ...(row ? JSON.parse(row.value_json) : {}), ...(req.body ?? {}) };
    db.prepare('INSERT OR REPLACE INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, ?)').run(
      'platform_config',
      JSON.stringify(merged),
      new Date().toISOString()
    );
    logAudit(db, req.auth!.userId, 'PLATFORM_SETTINGS_UPDATED', 'platform_settings', 'platform_config');
    res.json({ settings: merged });
  });

  router.get('/admin/audit-logs', requireAuth, requireRole('admin'), (_req, res) => {
    const logs = db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 60').all();
    res.json({ logs });
  });

  return router;
}
