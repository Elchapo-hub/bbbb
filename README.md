# SMG Corelink — Tanzania Domestic & International E-Commerce Platform

SMG Corelink is a dual-currency (**TZS & USD**) B2C and B2B commerce, milestone escrow, and cross-border logistics platform operating out of Dar es Salaam, Tanzania.

## Key Capabilities

- **8 Structured Product Categories (`CAT-01`..`CAT-08`)**: Men's Tailoring & Apparel, Women's Fashion & Accessories, Watches, Footwear, Handbags & Travel Gear, Tech & Electronics, Electricals & Home Appliances, and Digital Services & Trade Solutions—each with subtype taxonomies and dynamic specification schemas.
- **Dual-Currency Pricing & 15-Minute FX Lock**: Server-authoritative decimal-safe (`BigInt`) conversion between Tanzanian Shillings (TZS) and US Dollars (USD) using configurable base rate, spread basis points, and 15-minute checkout quote rate locks.
- **4 Logistics Corridors (`LOG-01`..`LOG-04`)**: Same-day Dar es Salaam courier, Tanzania domestic intercity air/road, East African Community (EAC) cross-border with customs clearance, and international export freight using chargeable weight (`max(actual, volumetric)`).
- **TRA-Compliant Configurable Tax Engine**: Supports standard Tanzanian VAT (`18%`), digital/service rates (`16%`), zero-rated exports (`0%` gated by export documentation), and exempt goods (`0%` gated by certificate). Generated PDF commercial invoices explicitly note non-EFD status pending TRA VFD/EFD integration.
- **Unified Payment Adapters & Milestone Escrow**: Server-orchestrated adapters for Mobile Money (M-Pesa, Mixx by Yas, Airtel Money, HaloPesa), Bank Transfer (CRDB, NMB, NBC, SWIFT), Card (3DS), and Corelink Milestone Escrow (`50% / 50%` or `30% / 40% / 30%`) with HMAC-verified webhook reconciliation.
- **4 Role Portals**: Customer, Merchant (onboarding, KYC, catalog CRUD, wholesale tiers, fulfillment), Operations/Logistics (hub updates, customs clearance, Delivery OTP verification), and Administrator (KPIs, merchant approvals, FX/Tax/Corridor configuration, escrow release, audit logs).

## Prerequisites

- **Node.js 20+** and **npm**
- Optional: **Supabase CLI** (if deploying the PostgreSQL migrations and Deno Edge Functions in `supabase/` to an external Supabase project)

## Local Setup & Running

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env` if configuring external keys (optional for local sandbox mode):
   ```bash
   cp .env.example .env
   ```
3. Start the full-stack development server (Express API + Vite SPA on port `3000`):
   ```bash
   npm run dev
   ```
4. Build for production and start:
   ```bash
   npm run build
   npm start
   ```

## Environment Variables

See `.env.example` for the full list:

| Variable | Purpose |
| --- | --- |
| `APP_URL` | Base URL for the hosted app (defaults to `http://localhost:3000`) |
| `SESSION_SECRET` | HMAC-SHA256 signing secret for Bearer authentication tokens |
| `ADMIN_BOOTSTRAP_PASSCODE` | Optional passcode override for claiming the initial administrator account |
| `BOT_FX_API_URL` | Optional Bank of Tanzania / commercial bank FX feed endpoint |
| `MPESA_API_KEY`, `MPESA_PUBLIC_KEY`, `MIXX_YAS_MERCHANT_KEY`, `AIRTEL_MONEY_CLIENT_SECRET`, `HALOPESA_API_SECRET`, `CARD_PROVIDER_SECRET_KEY` | Server-side payment gateway credentials |
| `WEBHOOK_SIGNING_SECRET` | HMAC secret used to verify inbound payment provider webhooks |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | External Supabase project credentials (`SUPABASE_SERVICE_ROLE_KEY` is server-only) |

## Administrator Access (First-Run Claim)

To avoid hardcoded privileged credentials, the seeded admin account (`admin@corelink.co.tz`) requires either:
- Configuring `ADMIN_BOOTSTRAP_PASSCODE` in the environment, **or**
- Claiming the first-run administrator account on `/auth` (Administrator Access tab) when no admin passcode has been claimed yet.

Demo customer (`amina.hassan@corelink.co.tz`), merchant (`karibu.bespoke@corelink.co.tz`), and operations (`ops.dar@corelink.co.tz`) accounts can be signed into directly via the one-click sandbox buttons on `/auth`.

## Testing & Verification

Run the deterministic financial engine property tests (10,000 randomized cart simulations) and end-to-end API integration tests:

```bash
npm test
npm run lint
npm run build
```

## Supabase Deployment Artifacts

All PostgreSQL schemas, row-level security policies, seed data, and Deno Edge Functions are included in `supabase/`:

- `supabase/migrations/001_initial_schema.sql` — 40 core tables with UUID keys, relational constraints, and indexes.
- `supabase/migrations/002_rls_policies.sql` — Row-Level Security policies enforced via `public.has_role()`.
- `supabase/migrations/003_seed_data.sql` — Initial 8 categories, FX rates, 4 corridors, and TRA tax configuration.
- `supabase/functions/calculate-quote/index.ts` — Authoritative quote & FX lock Edge Function.
- `supabase/functions/payment-webhook/index.ts` — HMAC-verified payment reconciliation Edge Function.
- `supabase/functions/fx-sync/index.ts` — Scheduled FX rate sync Edge Function.

To push to a linked Supabase project:

```bash
supabase db push
supabase functions deploy calculate-quote
supabase functions deploy payment-webhook
supabase functions deploy fx-sync
```

## Compliance Notice

PDF commercial invoices generated by SMG Corelink provide an itemized Dual-Currency breakdown for trade, customs, and internal accounting. They are **not** statutory Tanzania Revenue Authority (TRA) EFD/VFD fiscal tax receipts until connected to a certified VFD integration.
