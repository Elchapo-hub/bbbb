import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { CORE_CATEGORIES } from '../lib/categories';

let dbInstance: Database.Database | null = null;

export function hashPassword(password: string, saltHex?: string): string {
  const salt = saltHex ?? crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, keyHex] = storedHash.split(':');
  if (!salt || !keyHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

export function getDb(dbPath?: string): Database.Database {
  if (dbInstance && !dbPath) return dbInstance;

  const targetPath = dbPath ?? path.resolve(process.cwd(), 'data', 'smg_corelink.db');
  if (targetPath !== ':memory:') {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  }

  const db = new Database(targetPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  initializeSchema(db);
  seedDatabase(db);

  if (!dbPath) {
    dbInstance = db;
  }
  return db;
}

function initializeSchema(db: Database.Database) {
  db.exec(`
    -- 1. profiles
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL,
      email_verified INTEGER NOT NULL DEFAULT 0,
      verification_token TEXT,
      preferred_currency TEXT NOT NULL DEFAULT 'TZS',
      tax_profile TEXT NOT NULL DEFAULT 'retail_b2c',
      tin_number TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      notification_prefs TEXT NOT NULL DEFAULT '{"in_app":true,"email":true,"sms":false,"whatsapp":false}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- 2. user_roles
    CREATE TABLE IF NOT EXISTS user_roles (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(user_id, role)
    );

    -- 3. customer_addresses
    CREATE TABLE IF NOT EXISTS customer_addresses (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      recipient_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      country TEXT NOT NULL DEFAULT 'Tanzania',
      region_or_city TEXT NOT NULL,
      district TEXT NOT NULL,
      street_address TEXT NOT NULL,
      postal_code TEXT DEFAULT '',
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- 4. merchants
    CREATE TABLE IF NOT EXISTS merchants (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
      business_name TEXT NOT NULL,
      registration_number TEXT NOT NULL,
      tin_number TEXT NOT NULL,
      brela_number TEXT DEFAULT '',
      city TEXT NOT NULL,
      country TEXT NOT NULL DEFAULT 'Tanzania',
      description TEXT DEFAULT '',
      verification_status TEXT NOT NULL DEFAULT 'pending',
      verified_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- 5. merchant_documents
    CREATE TABLE IF NOT EXISTS merchant_documents (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
      doc_type TEXT NOT NULL,
      file_name TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      review_status TEXT NOT NULL DEFAULT 'pending',
      uploaded_at TEXT NOT NULL
    );

    -- 6. categories
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      subtypes_json TEXT NOT NULL,
      attribute_schema_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    -- 7. products
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
      category_id TEXT NOT NULL REFERENCES categories(id),
      sku TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      subtype TEXT NOT NULL,
      description TEXT NOT NULL,
      base_price_minor INTEGER NOT NULL,
      base_currency TEXT NOT NULL,
      weight_kg REAL NOT NULL DEFAULT 1.0,
      length_cm REAL NOT NULL DEFAULT 20,
      width_cm REAL NOT NULL DEFAULT 20,
      height_cm REAL NOT NULL DEFAULT 10,
      is_featured INTEGER NOT NULL DEFAULT 0,
      is_new_arrival INTEGER NOT NULL DEFAULT 0,
      is_best_seller INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- 8. product_images
    CREATE TABLE IF NOT EXISTS product_images (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      image_url TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    -- 9. product_variants
    CREATE TABLE IF NOT EXISTS product_variants (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      sku TEXT NOT NULL,
      name TEXT NOT NULL,
      stock_qty INTEGER NOT NULL DEFAULT 0,
      price_delta_minor INTEGER NOT NULL DEFAULT 0,
      attributes_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );

    -- 10. product_attributes
    CREATE TABLE IF NOT EXISTS product_attributes (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL UNIQUE REFERENCES products(id) ON DELETE CASCADE,
      attributes_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL
    );

    -- 11. inventory
    CREATE TABLE IF NOT EXISTS inventory (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL UNIQUE REFERENCES products(id) ON DELETE CASCADE,
      stock_qty INTEGER NOT NULL DEFAULT 0,
      reserved_qty INTEGER NOT NULL DEFAULT 0,
      low_stock_threshold INTEGER NOT NULL DEFAULT 5,
      updated_at TEXT NOT NULL
    );

    -- 12. price_history
    CREATE TABLE IF NOT EXISTS price_history (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      old_price_minor INTEGER NOT NULL,
      new_price_minor INTEGER NOT NULL,
      currency TEXT NOT NULL,
      changed_by TEXT,
      changed_at TEXT NOT NULL
    );

    -- 13. exchange_rates
    CREATE TABLE IF NOT EXISTS exchange_rates (
      id TEXT PRIMARY KEY,
      base_currency TEXT NOT NULL DEFAULT 'USD',
      quote_currency TEXT NOT NULL DEFAULT 'TZS',
      mid_rate REAL NOT NULL,
      spread_bps INTEGER NOT NULL DEFAULT 0,
      effective_rate REAL NOT NULL,
      source TEXT NOT NULL,
      is_fallback INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    -- 14. shipping_corridors
    CREATE TABLE IF NOT EXISTS shipping_corridors (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      incoterm TEXT NOT NULL,
      coverage_zones_json TEXT NOT NULL,
      estimated_delivery TEXT NOT NULL,
      is_export INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    -- 15. shipping_rates
    CREATE TABLE IF NOT EXISTS shipping_rates (
      id TEXT PRIMARY KEY,
      corridor_id TEXT NOT NULL UNIQUE REFERENCES shipping_corridors(id) ON DELETE CASCADE,
      base_currency TEXT NOT NULL,
      base_rate_minor INTEGER NOT NULL,
      included_weight_kg REAL NOT NULL DEFAULT 5.0,
      per_kg_rate_minor INTEGER NOT NULL,
      sea_lcl_per_cbm_usd_cents INTEGER DEFAULT 14500,
      sea_fcl_20ft_usd_cents INTEGER DEFAULT 185000,
      insurance_rate_bps INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    -- 16. carts
    CREATE TABLE IF NOT EXISTS carts (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES profiles(id) ON DELETE CASCADE,
      session_token TEXT UNIQUE,
      locked_fx_mid_rate REAL,
      locked_fx_spread_bps INTEGER,
      fx_locked_until TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- 17. cart_items
    CREATE TABLE IF NOT EXISTS cart_items (
      id TEXT PRIMARY KEY,
      cart_id TEXT NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      variant_id TEXT,
      quantity INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- 18. coupons
    CREATE TABLE IF NOT EXISTS coupons (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      discount_type TEXT NOT NULL,
      discount_value INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      min_purchase_minor INTEGER NOT NULL DEFAULT 0,
      max_discount_minor INTEGER,
      usage_limit INTEGER,
      used_count INTEGER NOT NULL DEFAULT 0,
      eligible_segment TEXT NOT NULL DEFAULT 'all',
      expires_at TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    -- 19. coupon_redemptions
    CREATE TABLE IF NOT EXISTS coupon_redemptions (
      id TEXT PRIMARY KEY,
      coupon_id TEXT NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      order_id TEXT,
      redeemed_at TEXT NOT NULL
    );

    -- 20. discount_rules
    CREATE TABLE IF NOT EXISTS discount_rules (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      rule_kind TEXT NOT NULL,
      min_qty INTEGER NOT NULL DEFAULT 1,
      discount_type TEXT NOT NULL,
      discount_value INTEGER NOT NULL,
      starts_at TEXT,
      ends_at TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    -- 21. orders
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      order_number TEXT NOT NULL UNIQUE,
      customer_id TEXT NOT NULL REFERENCES profiles(id),
      merchant_id TEXT NOT NULL REFERENCES merchants(id),
      status TEXT NOT NULL,
      corridor_code TEXT NOT NULL,
      incoterm TEXT NOT NULL,
      destination_zone TEXT NOT NULL,
      locked_fx_rate REAL NOT NULL,
      total_tzs INTEGER NOT NULL,
      total_usd_cents INTEGER NOT NULL,
      idempotency_key TEXT UNIQUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- 22. order_items
    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL REFERENCES products(id),
      variant_id TEXT,
      product_name TEXT NOT NULL,
      sku TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price_tzs INTEGER NOT NULL,
      unit_price_usd_cents INTEGER NOT NULL,
      product_discount_tzs INTEGER NOT NULL DEFAULT 0,
      product_discount_usd_cents INTEGER NOT NULL DEFAULT 0,
      line_total_tzs INTEGER NOT NULL,
      line_total_usd_cents INTEGER NOT NULL
    );

    -- 23. order_addresses
    CREATE TABLE IF NOT EXISTS order_addresses (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
      recipient_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      country TEXT NOT NULL,
      region_or_city TEXT NOT NULL,
      district TEXT NOT NULL,
      street_address TEXT NOT NULL
    );

    -- 24. order_calculations
    CREATE TABLE IF NOT EXISTS order_calculations (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
      gross_subtotal_tzs INTEGER NOT NULL,
      gross_subtotal_usd_cents INTEGER NOT NULL,
      product_discount_tzs INTEGER NOT NULL,
      product_discount_usd_cents INTEGER NOT NULL,
      coupon_code TEXT,
      coupon_discount_tzs INTEGER NOT NULL DEFAULT 0,
      coupon_discount_usd_cents INTEGER NOT NULL DEFAULT 0,
      shipping_fee_tzs INTEGER NOT NULL,
      shipping_fee_usd_cents INTEGER NOT NULL,
      insurance_fee_tzs INTEGER NOT NULL DEFAULT 0,
      insurance_fee_usd_cents INTEGER NOT NULL DEFAULT 0,
      tax_rule_code TEXT NOT NULL,
      tax_rate_bps INTEGER NOT NULL,
      vat_tzs INTEGER NOT NULL,
      vat_usd_cents INTEGER NOT NULL,
      final_total_tzs INTEGER NOT NULL,
      final_total_usd_cents INTEGER NOT NULL
    );

    -- 25. payments
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      payment_method TEXT NOT NULL,
      provider TEXT NOT NULL,
      provider_reference TEXT UNIQUE,
      amount_tzs INTEGER NOT NULL,
      amount_usd_cents INTEGER NOT NULL,
      currency TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      proof_url TEXT,
      instructions TEXT,
      idempotency_key TEXT UNIQUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- 26. payment_events
    CREATE TABLE IF NOT EXISTS payment_events (
      id TEXT PRIMARY KEY,
      payment_id TEXT NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    -- 27. escrow_accounts
    CREATE TABLE IF NOT EXISTS escrow_accounts (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
      merchant_id TEXT NOT NULL REFERENCES merchants(id),
      state TEXT NOT NULL DEFAULT 'Awaiting payment',
      held_tzs INTEGER NOT NULL DEFAULT 0,
      held_usd_cents INTEGER NOT NULL DEFAULT 0,
      released_tzs INTEGER NOT NULL DEFAULT 0,
      released_usd_cents INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    -- 28. escrow_ledger_entries
    CREATE TABLE IF NOT EXISTS escrow_ledger_entries (
      id TEXT PRIMARY KEY,
      escrow_account_id TEXT NOT NULL REFERENCES escrow_accounts(id) ON DELETE CASCADE,
      entry_type TEXT NOT NULL,
      amount_tzs INTEGER NOT NULL,
      amount_usd_cents INTEGER NOT NULL,
      note TEXT NOT NULL,
      actor_id TEXT,
      created_at TEXT NOT NULL
    );

    -- 29. shipments
    CREATE TABLE IF NOT EXISTS shipments (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
      corridor_code TEXT NOT NULL,
      tracking_reference TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'Awaiting Packing',
      packed_inspected INTEGER NOT NULL DEFAULT 0,
      shipping_doc_url TEXT,
      assigned_staff_id TEXT,
      updated_at TEXT NOT NULL
    );

    -- 30. shipment_events
    CREATE TABLE IF NOT EXISTS shipment_events (
      id TEXT PRIMARY KEY,
      shipment_id TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
      milestone TEXT NOT NULL,
      location TEXT NOT NULL,
      notes TEXT DEFAULT '',
      actor_id TEXT,
      created_at TEXT NOT NULL
    );

    -- 31. delivery_otps
    CREATE TABLE IF NOT EXISTS delivery_otps (
      id TEXT PRIMARY KEY,
      shipment_id TEXT NOT NULL UNIQUE REFERENCES shipments(id) ON DELETE CASCADE,
      otp_hash TEXT NOT NULL,
      otp_hint TEXT NOT NULL,
      verified INTEGER NOT NULL DEFAULT 0,
      verified_at TEXT,
      created_at TEXT NOT NULL
    );

    -- 32. invoices
    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
      invoice_number TEXT NOT NULL UNIQUE,
      invoice_type TEXT NOT NULL DEFAULT 'customer_invoice',
      issued_at TEXT NOT NULL
    );

    -- 33. reviews
    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      rating INTEGER NOT NULL,
      comment TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    -- 34. wishlists
    CREATE TABLE IF NOT EXISTS wishlists (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL
    );

    -- 35. wishlist_items
    CREATE TABLE IF NOT EXISTS wishlist_items (
      id TEXT PRIMARY KEY,
      wishlist_id TEXT NOT NULL REFERENCES wishlists(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      UNIQUE(wishlist_id, product_id)
    );

    -- 36. return_requests
    CREATE TABLE IF NOT EXISTS return_requests (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES profiles(id),
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'requested',
      created_at TEXT NOT NULL
    );

    -- 37. refund_requests
    CREATE TABLE IF NOT EXISTS refund_requests (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      return_request_id TEXT REFERENCES return_requests(id),
      amount_tzs INTEGER NOT NULL,
      amount_usd_cents INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      reviewed_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- 38. notifications
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      channel TEXT NOT NULL DEFAULT 'in_app',
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    -- 39. audit_logs
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      actor_id TEXT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      details_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );

    -- 40. platform_settings
    CREATE TABLE IF NOT EXISTS platform_settings (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
    CREATE INDEX IF NOT EXISTS idx_products_merchant ON products(merchant_id);
    CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
    CREATE INDEX IF NOT EXISTS idx_orders_merchant ON orders(merchant_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
  `);
}

function seedDatabase(db: Database.Database) {
  const existingCat = db.prepare('SELECT COUNT(*) as c FROM categories').get() as { c: number };
  if (existingCat.c > 0) return;

  const now = new Date().toISOString();

  // 1. Categories
  const insertCat = db.prepare(
    'INSERT INTO categories (id, code, name, slug, description, subtypes_json, attribute_schema_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  for (const cat of CORE_CATEGORIES) {
    insertCat.run(
      cat.id,
      cat.code,
      cat.name,
      cat.slug,
      cat.description,
      JSON.stringify(cat.subtypes),
      JSON.stringify(cat.attributeSchema),
      now
    );
  }

  // 2. Exchange Rates
  db.prepare(
    'INSERT INTO exchange_rates (id, base_currency, quote_currency, mid_rate, spread_bps, effective_rate, source, is_fallback, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run('fx-001', 'USD', 'TZS', 2680, 120, 2712.16, 'Bank of Tanzania Reference', 0, 1, now);

  // 3. Shipping Corridors & Rates
  const corridors = [
    {
      id: 'cor-01',
      code: 'LOG-01',
      name: 'Dar Express',
      incoterm: 'DDP',
      zones: ['Kinondoni', 'Ilala', 'Temeke', 'Ubungo', 'Kigamboni'],
      eta: 'Same day, 2–6 hours',
      isExport: 0,
      currency: 'TZS',
      baseRate: 5000,
      includedKg: 5,
      perKg: 800,
      insBps: 0,
    },
    {
      id: 'cor-02',
      code: 'LOG-02',
      name: 'Upcountry Tanzania',
      incoterm: 'DDP',
      zones: ['Arusha', 'Mwanza', 'Dodoma', 'Mbeya', 'Tanga', 'Mtwara', 'Zanzibar'],
      eta: '1–3 business days',
      isExport: 0,
      currency: 'TZS',
      baseRate: 15000,
      includedKg: 5,
      perKg: 2000,
      insBps: 0,
    },
    {
      id: 'cor-03',
      code: 'LOG-03',
      name: 'EAC & SADC',
      incoterm: 'DAP',
      zones: ['Kenya', 'Uganda', 'Rwanda', 'Burundi', 'DRC', 'Zambia', 'Malawi'],
      eta: '2–5 business days',
      isExport: 1,
      currency: 'USD',
      baseRate: 3500,
      includedKg: 5,
      perKg: 180,
      insBps: 50,
    },
    {
      id: 'cor-04',
      code: 'LOG-04',
      name: 'Global Air & Sea Export',
      incoterm: 'CIF',
      zones: ['UAE/GCC', 'EU', 'UK', 'USA', 'China', 'India'],
      eta: '4–10 days Air / 21–35 days Sea',
      isExport: 1,
      currency: 'USD',
      baseRate: 0,
      includedKg: 0,
      perKg: 650,
      insBps: 50,
    },
  ];

  const insertCor = db.prepare(
    'INSERT INTO shipping_corridors (id, code, name, incoterm, coverage_zones_json, estimated_delivery, is_export, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)'
  );
  const insertRate = db.prepare(
    'INSERT INTO shipping_rates (id, corridor_id, base_currency, base_rate_minor, included_weight_kg, per_kg_rate_minor, sea_lcl_per_cbm_usd_cents, sea_fcl_20ft_usd_cents, insurance_rate_bps, updated_at) VALUES (?, ?, ?, ?, ?, ?, 14500, 185000, ?, ?)'
  );
  for (const c of corridors) {
    insertCor.run(c.id, c.code, c.name, c.incoterm, JSON.stringify(c.zones), c.eta, c.isExport, now);
    insertRate.run(`rate-${c.id}`, c.id, c.currency, c.baseRate, c.includedKg, c.perKg, c.insBps, now);
  }

  // 4. Platform Settings (Tax Rules + General)
  const defaultTaxRules = [
    {
      id: 'tax-std',
      code: 'TAX-TZ-STD',
      name: 'Domestic Standard VAT (18%)',
      rateBps: 1800,
      appliesToLogistics: true,
      requiresExportDocs: false,
      requiresExemptionDocs: false,
      description: 'Standard Tanzania VAT on domestic taxable supplies and logistics.',
      active: true,
    },
    {
      id: 'tax-dig',
      code: 'TAX-TZ-DIG',
      name: 'Electronic B2C VAT (16%)',
      rateBps: 1600,
      appliesToLogistics: true,
      requiresExportDocs: false,
      requiresExemptionDocs: false,
      description: 'Eligible electronic B2C rate subject to current Finance Act & TRA verification (enable in Admin when applicable).',
      active: false,
    },
    {
      id: 'tax-exp',
      code: 'TAX-EXP-00',
      name: 'Verified International Export VAT (0%)',
      rateBps: 0,
      appliesToLogistics: false,
      requiresExportDocs: true,
      requiresExemptionDocs: false,
      description: 'Zero-rated international export requiring verified export declaration & airway/bill of lading evidence.',
      active: true,
    },
    {
      id: 'tax-exempt',
      code: 'TAX-EXEMPT',
      name: 'Verified Exempt Transaction (0%)',
      rateBps: 0,
      appliesToLogistics: false,
      requiresExportDocs: false,
      requiresExemptionDocs: true,
      description: 'Exempt supply requiring verified TRA exemption documentation.',
      active: true,
    },
  ];
  db.prepare('INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, ?)').run(
    'tax_rules',
    JSON.stringify(defaultTaxRules),
    now
  );
  db.prepare('INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, ?)').run(
    'platform_config',
    JSON.stringify({
      platformName: 'SMG Corelink',
      supportEmail: 'trade@smgcorelink.co.tz',
      supportPhone: '+255 22 211 8400',
      headquarters: 'Ohio Street, Ilala, Dar es Salaam, Tanzania',
      escrowReleaseHoursDomestic: 24,
      fxAutoSyncMinutes: 60,
      traEfdNotice: 'PDF invoices are commercial order documents. Official fiscal tax receipts are issued solely via an approved TRA EFD integration.',
    }),
    now
  );

  // 5. Users & Roles (non-admin demo accounts use standard demo hash; admin uses ADMIN_BOOTSTRAP_PASSCODE or first-run claim!)
  const demoPassHash = hashPassword('Corelink2026!');
  const users = [
    {
      id: 'usr-cust-1',
      email: 'amina.hassan@corelink.co.tz',
      fullName: 'Amina Hassan',
      phone: '+255 754 310 920',
      role: 'customer',
      currency: 'TZS',
      taxProfile: 'retail_b2c',
      tin: '',
    },
    {
      id: 'usr-merch-1',
      email: 'karibu.bespoke@corelink.co.tz',
      fullName: 'Juma Mwinyi',
      phone: '+255 713 880 412',
      role: 'merchant',
      currency: 'USD',
      taxProfile: 'business_b2b',
      tin: '104-882-910',
    },
    {
      id: 'usr-merch-2',
      email: 'eastcoast.electro@corelink.co.tz',
      fullName: 'Neema Kweka',
      phone: '+255 784 552 108',
      role: 'merchant',
      currency: 'USD',
      taxProfile: 'business_b2b',
      tin: '108-441-225',
    },
    {
      id: 'usr-merch-3',
      email: 'kilimanjaro.tech@corelink.co.tz',
      fullName: 'Baraka Mushi',
      phone: '+255 765 901 334',
      role: 'merchant',
      currency: 'USD',
      taxProfile: 'business_b2b',
      tin: '112-309-884',
    },
    {
      id: 'usr-ops-1',
      email: 'ops.dar@corelink.co.tz',
      fullName: 'Salim Kombo',
      phone: '+255 712 400 911',
      role: 'operations',
      currency: 'TZS',
      taxProfile: 'business_b2b',
      tin: '',
    },
  ];

  const insertUser = db.prepare(
    'INSERT INTO profiles (id, email, full_name, phone, password_hash, email_verified, preferred_currency, tax_profile, tin_number, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)'
  );
  const insertRole = db.prepare('INSERT INTO user_roles (id, user_id, role, created_at) VALUES (?, ?, ?, ?)');
  for (const u of users) {
    insertUser.run(u.id, u.email, u.fullName, u.phone, demoPassHash, u.currency, u.taxProfile, u.tin, 'active', now, now);
    insertRole.run(`role-${u.id}`, u.id, u.role, now);
  }

  // Customer address
  db.prepare(
    'INSERT INTO customer_addresses (id, user_id, label, recipient_name, phone, country, region_or_city, district, street_address, postal_code, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)'
  ).run(
    'addr-cust-1',
    'usr-cust-1',
    'Dar es Salaam Office',
    'Amina Hassan',
    '+255 754 310 920',
    'Tanzania',
    'Dar es Salaam',
    'Kinondoni',
    'Plot 42, Haile Selassie Road, Masaki',
    '14111',
    now,
    now
  );

  // 6. Merchants & Verification Docs
  const insertMerchant = db.prepare(
    'INSERT INTO merchants (id, user_id, business_name, registration_number, tin_number, brela_number, city, country, description, verification_status, verified_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  insertMerchant.run(
    'mrc-01',
    'usr-merch-1',
    'Dar Executive Tailoring & Leather Guild',
    'TZ-REG-90241',
    '104-882-910',
    'BRELA-448120',
    'Dar es Salaam',
    'Tanzania',
    'Verified manufacturer & exporter of executive menswear, womenswear, and full-grain leather goods.',
    'approved',
    now,
    now,
    now
  );
  insertMerchant.run(
    'mrc-02',
    'usr-merch-2',
    'East Coast Electrical & Solar Supply Ltd',
    'TZ-REG-77512',
    '108-441-225',
    'BRELA-330918',
    'Dar es Salaam',
    'Tanzania',
    'TBS & IEC certified supplier of armoured cables, switchgear, solar inverters, and flagship mobile hardware.',
    'approved',
    now,
    now,
    now
  );
  insertMerchant.run(
    'mrc-03',
    'usr-merch-3',
    'Kilimanjaro Horology & Mobile Distributors',
    'TZ-REG-55890',
    '112-309-884',
    'BRELA-612004',
    'Arusha',
    'Tanzania',
    'Authorized northern corridor electronics and luxury timepiece distributor awaiting compliance approval.',
    'pending',
    null,
    now,
    now
  );

  const insertDoc = db.prepare(
    'INSERT INTO merchant_documents (id, merchant_id, doc_type, file_name, storage_path, review_status, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  insertDoc.run('doc-1', 'mrc-01', 'BRELA Certificate of Incorporation', 'brela_dar_tailoring.pdf', 'private/merchants/mrc-01/brela.pdf', 'approved', now);
  insertDoc.run('doc-2', 'mrc-01', 'TRA TIN Certificate', 'tra_tin_104882910.pdf', 'private/merchants/mrc-01/tin.pdf', 'approved', now);
  insertDoc.run('doc-3', 'mrc-02', 'TBS & EWURA Supplier License', 'tbs_eastcoast_2026.pdf', 'private/merchants/mrc-02/tbs.pdf', 'approved', now);
  insertDoc.run('doc-4', 'mrc-03', 'BRELA Business Registration', 'brela_kilimanjaro_pending.pdf', 'private/merchants/mrc-03/brela.pdf', 'pending', now);
  insertDoc.run('doc-5', 'mrc-03', 'TCRA Device Dealer Permit', 'tcra_permit_kilimanjaro.pdf', 'private/merchants/mrc-03/tcra.pdf', 'pending', now);

  // 7. Curated 12 Products across all 8 categories
  const IMG_MENS = '/src/assets/images/cat_mens_tailoring_1795560175189.jpg';
  const IMG_SHOES = '/src/assets/images/cat_mens_shoes_1795561230666.jpg';
  const IMG_WATCH_BAG = '/src/assets/images/cat_watches_handbags_1795560175849.jpg';
  const IMG_WOMENS = '/src/assets/images/cat_womens_fashion_1795560176226.jpg';
  const IMG_TECH_ELEC = '/src/assets/images/cat_tech_electrical_1795560176959.jpg';
  const IMG_ELECTRICAL = '/src/assets/images/cat_electrical_switchgear_1795561231149.jpg';
  const IMG_HERO = '/src/assets/images/hero_corelink_commerce_1795560174816.jpg';

  const seededProducts = [
    {
      id: 'prd-01',
      merchantId: 'mrc-01',
      categoryId: 'cat-01',
      sku: 'SMG-SUIT-001',
      name: 'Savile Midnight Three-Piece Wool Suit',
      slug: 'savile-midnight-three-piece-wool-suit',
      subtype: 'Two-piece and three-piece suits',
      description: 'Half-canvassed Super 130s Merino wool three-piece executive suit tailored for East African boardrooms and international diplomacy.',
      basePriceMinor: 42000,
      baseCurrency: 'USD',
      weightKg: 1.85,
      l: 58,
      w: 42,
      h: 10,
      stock: 38,
      featured: 1,
      newArrival: 1,
      bestSeller: 1,
      img: IMG_MENS,
      attrs: { size: '50 EU', fit: 'Tailored Fit', fabric: '100% Super 130s Merino Wool', colour: 'Midnight Navy', origin: 'Dar es Salaam Atelier', careInstructions: 'Dry clean only', garmentWeight: '270 g/m²' },
      variants: [
        { id: 'var-01a', sku: 'SMG-SUIT-001-48', name: '48 EU · Midnight Navy', stock: 12, delta: 0 },
        { id: 'var-01b', sku: 'SMG-SUIT-001-50', name: '50 EU · Midnight Navy', stock: 16, delta: 0 },
        { id: 'var-01c', sku: 'SMG-SUIT-001-52', name: '52 EU · Charcoal', stock: 10, delta: 1500 },
      ],
      wholesale: [
        { minQty: 5, pct: 10 },
        { minQty: 15, pct: 15 },
        { minQty: 30, pct: 22 },
      ],
      promo: { type: 'percentage', value: 8, active: 1 },
    },
    {
      id: 'prd-02',
      merchantId: 'mrc-01',
      categoryId: 'cat-01',
      sku: 'SMG-SHRT-002',
      name: 'Sea Island Cotton Executive Oxford Shirt',
      slug: 'sea-island-cotton-oxford-shirt',
      subtype: 'Oxford shirts',
      description: 'Crisp two-ply long-staple cotton Oxford shirt with mother-of-pearl buttons and reinforced collar stays.',
      basePriceMinor: 165000,
      baseCurrency: 'TZS',
      weightKg: 0.45,
      l: 34,
      w: 26,
      h: 5,
      stock: 94,
      featured: 0,
      newArrival: 1,
      bestSeller: 1,
      img: IMG_HERO,
      attrs: { size: 'L', fit: 'Slim Fit', fabric: '100% Two-Ply Cotton Oxford', colour: 'Crisp White', origin: 'Tanzania / Woven in Italy', careInstructions: 'Machine wash 30°C', garmentWeight: '155 g/m²' },
      variants: [
        { id: 'var-02a', sku: 'SMG-SHRT-002-M', name: 'M · Crisp White', stock: 34, delta: 0 },
        { id: 'var-02b', sku: 'SMG-SHRT-002-L', name: 'L · Crisp White', stock: 40, delta: 0 },
        { id: 'var-02c', sku: 'SMG-SHRT-002-XL', name: 'XL · Sky Blue', stock: 20, delta: 0 },
      ],
      wholesale: [
        { minQty: 5, pct: 10 },
        { minQty: 15, pct: 16 },
      ],
      promo: null,
    },
    {
      id: 'prd-03',
      merchantId: 'mrc-01',
      categoryId: 'cat-02',
      sku: 'SMG-SHOE-M03',
      name: 'Kilimanjaro Goodyear-Welted Cap-Toe Oxfords',
      slug: 'kilimanjaro-goodyear-welted-oxfords',
      subtype: 'Oxford shoes',
      description: 'Hand-burnished full-grain calfskin Oxford dress shoes with cork-filled Goodyear welt construction for decades of resoling.',
      basePriceMinor: 21500,
      baseCurrency: 'USD',
      weightKg: 1.4,
      l: 35,
      w: 22,
      h: 13,
      stock: 42,
      featured: 1,
      newArrival: 0,
      bestSeller: 1,
      img: IMG_SHOES,
      attrs: { shoeSize: '42 EU / 8 UK', upperMaterial: 'Full-Grain Box Calfskin', soleType: 'Goodyear Welted Leather', colour: 'Espresso Burnished', authenticityStatus: 'Verified Genuine Leather', packageDimensions: '35 × 22 × 13 cm' },
      variants: [
        { id: 'var-03a', sku: 'SMG-SHOE-M03-41', name: '41 EU / 7 UK', stock: 12, delta: 0 },
        { id: 'var-03b', sku: 'SMG-SHOE-M03-42', name: '42 EU / 8 UK', stock: 18, delta: 0 },
        { id: 'var-03c', sku: 'SMG-SHOE-M03-43', name: '43 EU / 9 UK', stock: 12, delta: 0 },
      ],
      wholesale: [{ minQty: 5, pct: 10 }, { minQty: 15, pct: 15 }],
      promo: null,
    },
    {
      id: 'prd-04',
      merchantId: 'mrc-01',
      categoryId: 'cat-03',
      sku: 'SMG-WSUIT-004',
      name: 'Zanzibar Ivory Tailored Trouser Suit',
      slug: 'zanzibar-ivory-tailored-trouser-suit',
      subtype: 'Trouser suits',
      description: 'Structured single-breasted ivory blazer and high-waisted wide-leg trouser suit lined with breathable cupro silk.',
      basePriceMinor: 36000,
      baseCurrency: 'USD',
      weightKg: 1.5,
      l: 54,
      w: 40,
      h: 9,
      stock: 28,
      featured: 1,
      newArrival: 1,
      bestSeller: 0,
      img: IMG_WOMENS,
      attrs: { size: '38 EU', cut: 'Structured Tailored', fabricComposition: '82% Virgin Wool, 18% Mulberry Silk', liningType: 'Breathable Cupro Bemberg', colour: 'Warm Ivory', madeToOrder: true, productionLeadTime: '5–7 business days for custom sizing' },
      variants: [
        { id: 'var-04a', sku: 'SMG-WSUIT-004-38', name: '38 EU · Warm Ivory', stock: 14, delta: 0 },
        { id: 'var-04b', sku: 'SMG-WSUIT-004-40', name: '40 EU · Warm Ivory', stock: 14, delta: 0 },
      ],
      wholesale: [{ minQty: 5, pct: 10 }, { minQty: 15, pct: 15 }],
      promo: { type: 'percentage', value: 10, active: 1 },
    },
    {
      id: 'prd-05',
      merchantId: 'mrc-01',
      categoryId: 'cat-04',
      sku: 'SMG-WSHOE-005',
      name: 'Serengeti Architectural Leather Pumps',
      slug: 'serengeti-architectural-leather-pumps',
      subtype: 'Pumps',
      description: 'Pointed-toe executive pumps crafted from supple nappa leather with memory-foam arch support and 75mm balanced heel.',
      basePriceMinor: 420000,
      baseCurrency: 'TZS',
      weightKg: 0.9,
      l: 31,
      w: 19,
      h: 11,
      stock: 36,
      featured: 0,
      newArrival: 1,
      bestSeller: 1,
      img: IMG_WOMENS,
      attrs: { shoeSize: '38 EU', heelHeight: '75 mm', material: 'Italian Nappa Calfskin', colour: 'Alabaster Cream', authenticityStatus: 'Artisan Certified', sizeExchangeEligible: true },
      variants: [
        { id: 'var-05a', sku: 'SMG-WSHOE-005-37', name: '37 EU · Alabaster', stock: 12, delta: 0 },
        { id: 'var-05b', sku: 'SMG-WSHOE-005-38', name: '38 EU · Alabaster', stock: 14, delta: 0 },
        { id: 'var-05c', sku: 'SMG-WSHOE-005-39', name: '39 EU · Onyx Black', stock: 10, delta: 0 },
      ],
      wholesale: [{ minQty: 5, pct: 10 }],
      promo: null,
    },
    {
      id: 'prd-06',
      merchantId: 'mrc-01',
      categoryId: 'cat-05',
      sku: 'SMG-BAG-006',
      name: 'Corelink Heritage Full-Grain Attaché Briefcase',
      slug: 'corelink-heritage-full-grain-briefcase',
      subtype: 'Briefcases',
      description: 'Vegetable-tanned cognac leather briefcase featuring dual brass combination locks, padded 16-inch laptop bay, and serialised artisan certificate.',
      basePriceMinor: 29500,
      baseCurrency: 'USD',
      weightKg: 2.1,
      l: 43,
      w: 32,
      h: 14,
      stock: 22,
      featured: 1,
      newArrival: 0,
      bestSeller: 1,
      img: IMG_WATCH_BAG,
      attrs: { dimensions: '41 × 30 × 12 cm', material: 'Full-Grain Vegetable-Tanned Cowhide', hardwareFinish: 'Brushed Brass', certificate: 'SMG Artisan Serial #CG-2026', protectivePackaging: 'Cotton dust bag & rigid export carton' },
      variants: [
        { id: 'var-06a', sku: 'SMG-BAG-006-COG', name: 'Cognac Brown · Brass', stock: 14, delta: 0 },
        { id: 'var-06b', sku: 'SMG-BAG-006-ESP', name: 'Dark Espresso · Brass', stock: 8, delta: 0 },
      ],
      wholesale: [{ minQty: 5, pct: 12 }, { minQty: 15, pct: 18 }],
      promo: null,
    },
    {
      id: 'prd-07',
      merchantId: 'mrc-01',
      categoryId: 'cat-06',
      sku: 'SMG-WTC-007',
      name: 'Meridian Two-Tone Automatic Chronograph',
      slug: 'meridian-two-tone-automatic-chronograph',
      subtype: 'Chronographs',
      description: '41mm brushed steel and 18k gold-capped bezel automatic chronograph with sapphire exhibition caseback and 100m water resistance.',
      basePriceMinor: 89000,
      baseCurrency: 'USD',
      weightKg: 0.65,
      l: 18,
      w: 15,
      h: 11,
      stock: 14,
      featured: 1,
      newArrival: 1,
      bestSeller: 1,
      img: IMG_WATCH_BAG,
      attrs: { caseDiameter: '41 mm', strapMaterial: '316L Steel & 18k Gold PVD Links', waterResistance: '100m / 10 ATM', movement: 'Swiss Automatic', serialNumber: 'MRD-8824-TZ', warrantyPeriod: '36 Months International' },
      variants: [
        { id: 'var-07a', sku: 'SMG-WTC-007-SLV', name: 'Silver Dial · Two-Tone', stock: 9, delta: 0 },
        { id: 'var-07b', sku: 'SMG-WTC-007-NVY', name: 'Navy Dial · Two-Tone', stock: 5, delta: 2500 },
      ],
      wholesale: [{ minQty: 5, pct: 8 }],
      promo: { type: 'percentage', value: 5, active: 1 },
    },
    {
      id: 'prd-08',
      merchantId: 'mrc-02',
      categoryId: 'cat-07',
      sku: 'SMG-PHN-008',
      name: 'Flagship Pro Max 512GB Titanium (TCRA Approved)',
      slug: 'flagship-pro-max-512gb-titanium',
      subtype: 'Apple iPhone',
      description: 'Factory-unlocked flagship smartphone with verified TCRA type-approval, clean IMEI registry, and 12-month official East Africa warranty.',
      basePriceMinor: 129000,
      baseCurrency: 'USD',
      weightKg: 0.45,
      l: 19,
      w: 11,
      h: 5,
      stock: 25,
      featured: 1,
      newArrival: 1,
      bestSeller: 1,
      img: IMG_TECH_ELEC,
      attrs: { storage: '512 GB', ram: '8 GB', colour: 'Natural Titanium', network: '5G / LTE Global', simConfiguration: 'Dual eSIM + Nano-SIM', condition: 'Brand New Sealed', imeiRegistration: 'Verified Clean IMEI (TCRA)', tcraApprovalStatus: 'TCRA Type Approved', warranty: '12 Months Official Hardware Warranty' },
      variants: [
        { id: 'var-08a', sku: 'SMG-PHN-008-256', name: '256 GB · Natural Titanium', stock: 12, delta: -15000 },
        { id: 'var-08b', sku: 'SMG-PHN-008-512', name: '512 GB · Natural Titanium', stock: 13, delta: 0 },
      ],
      wholesale: [{ minQty: 5, pct: 6 }, { minQty: 15, pct: 10 }],
      promo: null,
    },
    {
      id: 'prd-09',
      merchantId: 'mrc-02',
      categoryId: 'cat-07',
      sku: 'SMG-PHN-009',
      name: 'Galaxy Enterprise S-Ultra 256GB 5G',
      slug: 'galaxy-enterprise-s-ultra-256gb',
      subtype: 'Samsung Galaxy',
      description: 'Enterprise-ready 5G smartphone featuring Knox hardware security, dual physical SIM + eSIM, and official Tanzania warranty.',
      basePriceMinor: 2890000,
      baseCurrency: 'TZS',
      weightKg: 0.48,
      l: 19,
      w: 11,
      h: 5,
      stock: 30,
      featured: 0,
      newArrival: 1,
      bestSeller: 0,
      img: IMG_TECH_ELEC,
      attrs: { storage: '256 GB', ram: '12 GB', colour: 'Titanium Gray', network: '5G / LTE Global', simConfiguration: 'Dual Nano-SIM', condition: 'Brand New Sealed', imeiRegistration: 'Verified Clean IMEI (TCRA)', tcraApprovalStatus: 'TCRA Type Approved', warranty: '24 Months Authorised Care' },
      variants: [
        { id: 'var-09a', sku: 'SMG-PHN-009-256', name: '256 GB · Titanium Gray', stock: 20, delta: 0 },
        { id: 'var-09b', sku: 'SMG-PHN-009-512', name: '512 GB · Phantom Black', stock: 10, delta: 320000 },
      ],
      wholesale: [{ minQty: 5, pct: 7 }, { minQty: 15, pct: 12 }],
      promo: null,
    },
    {
      id: 'prd-10',
      merchantId: 'mrc-02',
      categoryId: 'cat-08',
      sku: 'SMG-ELC-010',
      name: '4-Core 16mm² Steel Wire Armoured Copper Cable (100m Drum)',
      slug: '4-core-16mm-swa-copper-cable-100m',
      subtype: 'Armoured cables',
      description: 'Heavy-duty XLPE insulated galvanized steel wire armoured (SWA) copper power cable compliant with TBS TZS 120 and IEC 60502-1.',
      basePriceMinor: 68000,
      baseCurrency: 'USD',
      weightKg: 48.0,
      l: 70,
      w: 70,
      h: 45,
      stock: 40,
      featured: 1,
      newArrival: 0,
      bestSeller: 1,
      img: IMG_ELECTRICAL,
      attrs: { voltage: '600/1000 V', amperage: '94 A (Buried) / 110 A (Air)', cableCrossSection: '4 × 16 mm² Stranded Copper', ipRating: 'IP68', unitOrRollLength: '100m Sealed Drum', tbsCertification: 'TBS Mark #TZ-EL-8812', iecCertification: 'IEC 60502-1 Certified', minimumOrderQuantity: 1 },
      variants: [
        { id: 'var-10a', sku: 'SMG-ELC-010-100', name: '100m Drum', stock: 40, delta: 0 },
      ],
      wholesale: [
        { minQty: 5, pct: 10 },
        { minQty: 15, pct: 15 },
        { minQty: 30, pct: 20 },
      ],
      promo: null,
    },
    {
      id: 'prd-11',
      merchantId: 'mrc-02',
      categoryId: 'cat-08',
      sku: 'SMG-ELC-011',
      name: '5kW Hybrid MPPT Solar Inverter & Breaker Kit',
      slug: '5kw-hybrid-mppt-solar-inverter-kit',
      subtype: 'Solar inverters',
      description: 'Pure sine-wave 48V 5kW hybrid solar inverter with dual MPPT charge controllers and DIN-rail MCB protection block.',
      basePriceMinor: 1950000,
      baseCurrency: 'TZS',
      weightKg: 14.5,
      l: 52,
      w: 38,
      h: 22,
      stock: 4, // deliberately triggers low-stock alert!
      featured: 1,
      newArrival: 1,
      bestSeller: 1,
      img: IMG_ELECTRICAL,
      attrs: { voltage: '230V AC / 48V DC', amperage: '100A MPPT', cableCrossSection: '16 mm² DC Terminal', ipRating: 'IP65', unitOrRollLength: '1 Complete Kit', tbsCertification: 'TBS TZS-SOL-204', iecCertification: 'IEC 62109-1 / 62109-2', minimumOrderQuantity: 1 },
      variants: [
        { id: 'var-11a', sku: 'SMG-ELC-011-5KW', name: '5kW Single-Phase 230V', stock: 4, delta: 0 },
      ],
      wholesale: [{ minQty: 5, pct: 12 }, { minQty: 15, pct: 18 }],
      promo: { type: 'fixed', value: 120000, active: 1 },
    },
    {
      id: 'prd-12',
      merchantId: 'mrc-02',
      categoryId: 'cat-08',
      sku: 'SMG-ELC-012',
      name: 'Industrial 63A 3-Pole MCCB & DIN Distribution Enclosure',
      slug: 'industrial-63a-mccb-distribution-enclosure',
      subtype: 'MCB/MCCB',
      description: 'High-breaking capacity 25kA moulded case circuit breaker paired with IP65 powder-coated steel distribution panel.',
      basePriceMinor: 14500,
      baseCurrency: 'USD',
      weightKg: 3.6,
      l: 36,
      w: 28,
      h: 16,
      stock: 60,
      featured: 0,
      newArrival: 0,
      bestSeller: 0,
      img: IMG_ELECTRICAL,
      attrs: { voltage: '415V AC 3-Phase', amperage: '63 A', cableCrossSection: 'Up to 35 mm²', ipRating: 'IP65', unitOrRollLength: '1 Assembly', tbsCertification: 'TBS TZS-441', iecCertification: 'IEC 60947-2', minimumOrderQuantity: 2 },
      variants: [
        { id: 'var-12a', sku: 'SMG-ELC-012-63A', name: '63A 3-Pole', stock: 60, delta: 0 },
      ],
      wholesale: [{ minQty: 5, pct: 10 }, { minQty: 15, pct: 15 }, { minQty: 30, pct: 22 }],
      promo: null,
    },
  ];

  const insertProd = db.prepare(
    'INSERT INTO products (id, merchant_id, category_id, sku, name, slug, subtype, description, base_price_minor, base_currency, weight_kg, length_cm, width_cm, height_cm, is_featured, is_new_arrival, is_best_seller, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)'
  );
  const insertImg = db.prepare('INSERT INTO product_images (id, product_id, image_url, sort_order, created_at) VALUES (?, ?, ?, 0, ?)');
  const insertAttr = db.prepare('INSERT INTO product_attributes (id, product_id, attributes_json, updated_at) VALUES (?, ?, ?, ?)');
  const insertInv = db.prepare('INSERT INTO inventory (id, product_id, stock_qty, reserved_qty, low_stock_threshold, updated_at) VALUES (?, ?, ?, 0, 5, ?)');
  const insertVar = db.prepare('INSERT INTO product_variants (id, product_id, sku, name, stock_qty, price_delta_minor, attributes_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const insertRule = db.prepare('INSERT INTO discount_rules (id, product_id, rule_kind, min_qty, discount_type, discount_value, active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)');

  for (const p of seededProducts) {
    insertProd.run(
      p.id, p.merchantId, p.categoryId, p.sku, p.name, p.slug, p.subtype, p.description,
      p.basePriceMinor, p.baseCurrency, p.weightKg, p.l, p.w, p.h, p.featured, p.newArrival, p.bestSeller, now, now
    );
    insertImg.run(`img-${p.id}`, p.id, p.img, now);
    insertAttr.run(`attr-${p.id}`, p.id, JSON.stringify(p.attrs), now);
    insertInv.run(`inv-${p.id}`, p.id, p.stock, now);
    for (const v of p.variants) {
      insertVar.run(v.id, p.id, v.sku, v.name, v.stock, v.delta, '{}', now);
    }
    for (const w of p.wholesale) {
      insertRule.run(`w-${p.id}-${w.minQty}`, p.id, 'wholesale_tier', w.minQty, 'percentage', w.pct, now);
    }
    if (p.promo) {
      insertRule.run(`promo-${p.id}`, p.id, 'promotion', 1, p.promo.type, p.promo.value, now);
    }
  }

  // 8. Coupons
  const insertCoupon = db.prepare(
    'INSERT INTO coupons (id, code, discount_type, discount_value, currency, min_purchase_minor, max_discount_minor, usage_limit, used_count, eligible_segment, expires_at, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 1, ?)'
  );
  insertCoupon.run('cpn-1', 'CORELINK10', 'percentage', 10, 'USD', 5000, 50000, 500, 'all', '2027-12-31T23:59:59Z', now);
  insertCoupon.run('cpn-2', 'DARFREE', 'fixed', 5000, 'TZS', 100000, 5000, 200, 'all', '2027-12-31T23:59:59Z', now);
  insertCoupon.run('cpn-3', 'WHOLESALE50', 'fixed', 5000, 'USD', 50000, 5000, 100, 'wholesale', '2027-12-31T23:59:59Z', now);

  // 9. Reviews
  db.prepare('INSERT INTO reviews (id, product_id, user_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    'rev-1', 'prd-01', 'usr-cust-1', 5, 'Superb drape and half-canvas structure. Delivered to Kinondoni in under 4 hours.', now
  );
  db.prepare('INSERT INTO reviews (id, product_id, user_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    'rev-2', 'prd-10', 'usr-cust-1', 5, 'TBS certification tags intact and armoured sheathing passed site electrical inspection.', now
  );

  // 10. Seeded Historical Orders (Completed + In Transit + Awaiting Bank Reconciliation)
  const ord1Time = new Date(Date.now() - 4 * 86400 * 1000).toISOString();
  db.prepare(
    'INSERT INTO orders (id, order_number, customer_id, merchant_id, status, corridor_code, incoterm, destination_zone, locked_fx_rate, total_tzs, total_usd_cents, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run('ord-seed-1', 'SMG-2026-1001', 'usr-cust-1', 'mrc-01', 'Completed', 'LOG-01', 'DDP', 'Kinondoni', 2712.16, 1280140, 47200, ord1Time, now);

  db.prepare(
    'INSERT INTO order_items (id, order_id, product_id, product_name, sku, quantity, unit_price_tzs, unit_price_usd_cents, product_discount_tzs, product_discount_usd_cents, line_total_tzs, line_total_usd_cents) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)'
  ).run('oi-seed-1', 'ord-seed-1', 'prd-01', 'Savile Midnight Three-Piece Wool Suit', 'SMG-SUIT-001', 1139107, 42000, 91129, 3360, 1047978, 38640);

  db.prepare(
    'INSERT INTO order_addresses (id, order_id, recipient_name, phone, country, region_or_city, district, street_address) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run('oa-seed-1', 'ord-seed-1', 'Amina Hassan', '+255 754 310 920', 'Tanzania', 'Dar es Salaam', 'Kinondoni', 'Plot 42, Haile Selassie Road, Masaki');

  db.prepare(
    'INSERT INTO order_calculations (id, order_id, gross_subtotal_tzs, gross_subtotal_usd_cents, product_discount_tzs, product_discount_usd_cents, coupon_code, coupon_discount_tzs, coupon_discount_usd_cents, shipping_fee_tzs, shipping_fee_usd_cents, insurance_fee_tzs, insurance_fee_usd_cents, tax_rule_code, tax_rate_bps, vat_tzs, vat_usd_cents, final_total_tzs, final_total_usd_cents) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, 1800, ?, ?, ?, ?)'
  ).run('oc-seed-1', 'ord-seed-1', 1139107, 42000, 91129, 3360, null, 0, 0, 5000, 184, 'TAX-TZ-STD', 189535, 6988, 1242513, 45812);

  db.prepare(
    'INSERT INTO payments (id, order_id, payment_method, provider, provider_reference, amount_tzs, amount_usd_cents, currency, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run('pay-seed-1', 'ord-seed-1', 'mobile_money', 'vodacom_mpesa', 'MPESA-TZ-884120', 1242513, 45812, 'TZS', 'confirmed', ord1Time, now);

  db.prepare(
    'INSERT INTO escrow_accounts (id, order_id, merchant_id, state, held_tzs, held_usd_cents, released_tzs, released_usd_cents, updated_at) VALUES (?, ?, ?, ?, 0, 0, ?, ?, ?)'
  ).run('esc-seed-1', 'ord-seed-1', 'mrc-01', 'Released', 1242513, 45812, now);

  db.prepare(
    'INSERT INTO escrow_ledger_entries (id, escrow_account_id, entry_type, amount_tzs, amount_usd_cents, note, actor_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run('ele-seed-1a', 'esc-seed-1', 'FUNDED', 1242513, 45812, 'M-Pesa confirmed into milestone escrow ledger', 'usr-cust-1', ord1Time);
  db.prepare(
    'INSERT INTO escrow_ledger_entries (id, escrow_account_id, entry_type, amount_tzs, amount_usd_cents, note, actor_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run('ele-seed-1b', 'esc-seed-1', 'RELEASED', 1242513, 45812, 'Released following Kinondoni delivery OTP verification', 'usr-ops-1', now);

  db.prepare(
    'INSERT INTO shipments (id, order_id, corridor_code, tracking_reference, status, packed_inspected, assigned_staff_id, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)'
  ).run('shp-seed-1', 'ord-seed-1', 'LOG-01', 'SMG-DAR-90124', 'Delivered', 'usr-ops-1', now);

  db.prepare(
    'INSERT INTO shipment_events (id, shipment_id, milestone, location, notes, actor_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run('se-1', 'shp-seed-1', 'Packed & Inspected', 'Ilala Fulfillment Hub, Dar es Salaam', 'Quality and tailoring checklist passed', 'usr-ops-1', ord1Time);
  db.prepare(
    'INSERT INTO shipment_events (id, shipment_id, milestone, location, notes, actor_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run('se-2', 'shp-seed-1', 'Delivered', 'Masaki, Kinondoni', 'Customer OTP verified on handover', 'usr-ops-1', now);

  db.prepare(
    'INSERT INTO delivery_otps (id, shipment_id, otp_hash, otp_hint, verified, verified_at, created_at) VALUES (?, ?, ?, ?, 1, ?, ?)'
  ).run('otp-seed-1', 'shp-seed-1', hashPassword('482910'), '48**10', now, ord1Time);

  db.prepare('INSERT INTO invoices (id, order_id, invoice_number, invoice_type, issued_at) VALUES (?, ?, ?, ?, ?)').run(
    'inv-seed-1', 'ord-seed-1', 'INV-SMG-2026-1001', 'customer_invoice', ord1Time
  );

  // Order 2: In Transit EAC Export
  const ord2Time = new Date(Date.now() - 1 * 86400 * 1000).toISOString();
  db.prepare(
    'INSERT INTO orders (id, order_number, customer_id, merchant_id, status, corridor_code, incoterm, destination_zone, locked_fx_rate, total_tzs, total_usd_cents, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run('ord-seed-2', 'SMG-2026-1002', 'usr-cust-1', 'mrc-02', 'In Transit', 'LOG-03', 'DAP', 'Kenya', 2712.16, 10074500, 371457, ord2Time, now);

  db.prepare(
    'INSERT INTO order_items (id, order_id, product_id, product_name, sku, quantity, unit_price_tzs, unit_price_usd_cents, product_discount_tzs, product_discount_usd_cents, line_total_tzs, line_total_usd_cents) VALUES (?, ?, ?, ?, ?, 5, ?, ?, ?, ?, ?, ?)'
  ).run('oi-seed-2', 'ord-seed-2', 'prd-10', '4-Core 16mm² Steel Wire Armoured Copper Cable (100m Drum)', 'SMG-ELC-010', 1844269, 68000, 922134, 34000, 8299210, 306000);

  db.prepare(
    'INSERT INTO order_addresses (id, order_id, recipient_name, phone, country, region_or_city, district, street_address) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run('oa-seed-2', 'ord-seed-2', 'Amina Hassan', '+254 711 220 410', 'Kenya', 'Nairobi', 'Industrial Area', 'Enterprise Road, Godown 14');

  db.prepare(
    'INSERT INTO order_calculations (id, order_id, gross_subtotal_tzs, gross_subtotal_usd_cents, product_discount_tzs, product_discount_usd_cents, coupon_code, coupon_discount_tzs, coupon_discount_usd_cents, shipping_fee_tzs, shipping_fee_usd_cents, insurance_fee_tzs, insurance_fee_usd_cents, tax_rule_code, tax_rate_bps, vat_tzs, vat_usd_cents, final_total_tzs, final_total_usd_cents) VALUES (?, ?, ?, ?, ?, ?, null, 0, 0, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?)'
  ).run('oc-seed-2', 'ord-seed-2', 9221344, 340000, 922134, 34000, 1242712, 45820, 41496, 1530, 'TAX-EXP-00', 9583418, 353350);

  db.prepare(
    'INSERT INTO payments (id, order_id, payment_method, provider, provider_reference, amount_tzs, amount_usd_cents, currency, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run('pay-seed-2', 'ord-seed-2', 'bank_transfer', 'crdb', 'CRDB-SWIFT-99201', 9583418, 353350, 'USD', 'confirmed', ord2Time, now);

  db.prepare(
    'INSERT INTO escrow_accounts (id, order_id, merchant_id, state, held_tzs, held_usd_cents, released_tzs, released_usd_cents, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?)'
  ).run('esc-seed-2', 'ord-seed-2', 'mrc-02', 'In transit', 9583418, 353350, now);

  db.prepare(
    'INSERT INTO escrow_ledger_entries (id, escrow_account_id, entry_type, amount_tzs, amount_usd_cents, note, actor_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run('ele-seed-2a', 'esc-seed-2', 'ESCROW_HELD', 9583418, 353350, 'Export order funded; held pending EAC border clearance & POD', 'usr-cust-1', ord2Time);

  db.prepare(
    'INSERT INTO shipments (id, order_id, corridor_code, tracking_reference, status, packed_inspected, shipping_doc_url, assigned_staff_id, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)'
  ).run('shp-seed-2', 'ord-seed-2', 'LOG-03', 'SMG-EAC-44019', 'In Transit', 'docs/export/eac-manifest-1002.pdf', 'usr-ops-1', now);

  db.prepare(
    'INSERT INTO shipment_events (id, shipment_id, milestone, location, notes, actor_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run('se-3', 'shp-seed-2', 'Packed & Inspected', 'Dar es Salaam Bonded Depot', 'TBS cable batch certs attached to commercial invoice', 'usr-ops-1', ord2Time);
  db.prepare(
    'INSERT INTO shipment_events (id, shipment_id, milestone, location, notes, actor_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run('se-4', 'shp-seed-2', 'In Transit', 'Namanga Border Post (TZ-KE)', 'EAC customs clearance underway', 'usr-ops-1', now);

  db.prepare(
    'INSERT INTO delivery_otps (id, shipment_id, otp_hash, otp_hint, verified, created_at) VALUES (?, ?, ?, ?, 0, ?)'
  ).run('otp-seed-2', 'shp-seed-2', hashPassword('739104'), '73**04', ord2Time);

  db.prepare('INSERT INTO invoices (id, order_id, invoice_number, invoice_type, issued_at) VALUES (?, ?, ?, ?, ?)').run(
    'inv-seed-2', 'ord-seed-2', 'INV-SMG-2026-1002', 'commercial_invoice', ord2Time
  );

  // Notification for customer
  db.prepare('INSERT INTO notifications (id, user_id, channel, title, message, is_read, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)').run(
    'ntf-1', 'usr-cust-1', 'in_app', 'Shipment In Transit — Namanga Border', 'Order SMG-2026-1002 (5x SWA Copper Cable Drums) cleared Dar es Salaam hub and is crossing Namanga.', now
  );
  db.prepare('INSERT INTO notifications (id, user_id, channel, title, message, is_read, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)').run(
    'ntf-2', 'usr-merch-1', 'in_app', 'Escrow Settlement Released', 'TZS 1,242,513 ($458.12) released for Order SMG-2026-1001 following OTP confirmation.', now
  );
}
