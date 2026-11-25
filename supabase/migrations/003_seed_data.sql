-- SMG Corelink Migration 003: Seed Reference Categories, Corridors, Taxes, FX & Settings

INSERT INTO public.categories (code, name, slug, description) VALUES
  ('CAT-01', 'Men''s Clothing', 'mens-clothing', 'Official suits, two/three-piece suits, tuxedos, blazers, chinos, polos, Oxford shirts'),
  ('CAT-02', 'Men''s Fashion Shoes', 'mens-fashion-shoes', 'Oxfords, Derbies, monk straps, loafers, sneakers, leather sandals'),
  ('CAT-03', 'Women''s Suits', 'womens-suits', 'Executive skirt suits, trouser suits, blazer sets, smart-casual co-ords'),
  ('CAT-04', 'Women''s Shoes', 'womens-shoes', 'Heels, pumps, flats, sneakers, wedges, sandals'),
  ('CAT-05', 'Handbags', 'handbags', 'Totes, crossbody bags, briefcases, evening clutches, travel duffels'),
  ('CAT-06', 'Watches', 'watches', 'Automatic watches, quartz watches, chronographs, smartwatches, gift sets'),
  ('CAT-07', 'Smartphones', 'smartphones', 'Apple iPhone, Samsung Galaxy, Xiaomi, Google Pixel, TCRA approved devices'),
  ('CAT-08', 'Electrical Materials', 'electrical-materials', 'Armoured & PVC cables, circuit breakers, distribution boards, LED floodlights, solar inverters')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.exchange_rates (base_currency, quote_currency, mid_rate, spread_bps, effective_rate, source, is_fallback, is_active)
VALUES ('USD', 'TZS', 2680.0000, 120, 2712.1600, 'Bank of Tanzania Reference', FALSE, TRUE);

INSERT INTO public.shipping_corridors (code, name, incoterm, coverage_zones, estimated_delivery, is_export, active) VALUES
  ('LOG-01', 'Dar Express', 'DDP', '["Kinondoni","Ilala","Temeke","Ubungo","Kigamboni"]'::jsonb, 'Same day, 2–6 hours', FALSE, TRUE),
  ('LOG-02', 'Upcountry Tanzania', 'DDP', '["Arusha","Mwanza","Dodoma","Mbeya","Tanga","Mtwara","Zanzibar"]'::jsonb, '1–3 business days', FALSE, TRUE),
  ('LOG-03', 'EAC & SADC', 'DAP', '["Kenya","Uganda","Rwanda","Burundi","DRC","Zambia","Malawi"]'::jsonb, '2–5 business days', TRUE, TRUE),
  ('LOG-04', 'Global Air & Sea Export', 'CIF', '["UAE/GCC","EU","UK","USA","China","India"]'::jsonb, '4–10 days Air / 21–35 days Sea', TRUE, TRUE)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.platform_settings (key, value) VALUES
  ('tax_rules', '[
    {"code":"TAX-TZ-STD","name":"Domestic Standard VAT (18%)","rateBps":1800,"appliesToLogistics":true},
    {"code":"TAX-TZ-DIG","name":"Electronic B2C VAT (16%)","rateBps":1600,"appliesToLogistics":true},
    {"code":"TAX-EXP-00","name":"Verified International Export VAT (0%)","rateBps":0,"appliesToLogistics":false},
    {"code":"TAX-EXEMPT","name":"Verified Exempt Transaction (0%)","rateBps":0,"appliesToLogistics":false}
  ]'::jsonb),
  ('tra_efd_notice', '{"fiscalReceiptMode":"pending_tra_efd_integration"}'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
