-- SMG Corelink Migration 002: Row Level Security (RLS) Policies

CREATE OR REPLACE FUNCTION public.has_role(target_role TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = target_role
  );
$$;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escrow_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escrow_ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_otps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wishlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.return_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refund_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Profiles: own profile or admin
CREATE POLICY "profiles_select_own_or_admin" ON public.profiles
  FOR SELECT USING (id = auth.uid() OR public.has_role('admin'));
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (id = auth.uid() OR public.has_role('admin'));

-- Customer addresses
CREATE POLICY "addresses_owner_all" ON public.customer_addresses
  FOR ALL USING (user_id = auth.uid() OR public.has_role('admin'));

-- Merchants & private documents
CREATE POLICY "merchants_public_read_approved" ON public.merchants
  FOR SELECT USING (verification_status = 'approved' OR user_id = auth.uid() OR public.has_role('admin'));
CREATE POLICY "merchants_update_own" ON public.merchants
  FOR UPDATE USING (user_id = auth.uid() OR public.has_role('admin'));

CREATE POLICY "merchant_docs_owner_or_admin" ON public.merchant_documents
  FOR ALL USING (
    public.has_role('admin') OR EXISTS (
      SELECT 1 FROM public.merchants m WHERE m.id = merchant_id AND m.user_id = auth.uid()
    )
  );

-- Products: public read active, merchant write own
CREATE POLICY "products_read_active" ON public.products
  FOR SELECT USING (is_active = TRUE OR public.has_role('admin') OR EXISTS (
    SELECT 1 FROM public.merchants m WHERE m.id = merchant_id AND m.user_id = auth.uid()
  ));
CREATE POLICY "products_merchant_write" ON public.products
  FOR ALL USING (public.has_role('admin') OR EXISTS (
    SELECT 1 FROM public.merchants m WHERE m.id = merchant_id AND m.user_id = auth.uid() AND m.verification_status = 'approved'
  ));

-- Orders: customer, owning merchant, operations, or admin
CREATE POLICY "orders_role_scoped_select" ON public.orders
  FOR SELECT USING (
    customer_id = auth.uid()
    OR public.has_role('admin')
    OR public.has_role('operations')
    OR EXISTS (SELECT 1 FROM public.merchants m WHERE m.id = merchant_id AND m.user_id = auth.uid())
  );

-- Payments & Escrow: customer/merchant scoped read, admin write
CREATE POLICY "payments_scoped_select" ON public.payments
  FOR SELECT USING (
    public.has_role('admin') OR EXISTS (
      SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.customer_id = auth.uid()
    )
  );

CREATE POLICY "escrow_scoped_select" ON public.escrow_accounts
  FOR SELECT USING (
    public.has_role('admin') OR EXISTS (
      SELECT 1 FROM public.merchants m WHERE m.id = merchant_id AND m.user_id = auth.uid()
    )
  );

-- Shipments & Delivery OTPs: operations & admin & order customer
CREATE POLICY "shipments_select" ON public.shipments
  FOR SELECT USING (
    public.has_role('admin') OR public.has_role('operations') OR EXISTS (
      SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.customer_id = auth.uid()
    )
  );
CREATE POLICY "shipments_ops_update" ON public.shipments
  FOR UPDATE USING (public.has_role('operations') OR public.has_role('admin'));

-- Notifications & Wishlists
CREATE POLICY "notifications_own" ON public.notifications
  FOR ALL USING (user_id = auth.uid());
CREATE POLICY "wishlists_own" ON public.wishlists
  FOR ALL USING (user_id = auth.uid());
CREATE POLICY "audit_logs_admin_only" ON public.audit_logs
  FOR SELECT USING (public.has_role('admin'));
