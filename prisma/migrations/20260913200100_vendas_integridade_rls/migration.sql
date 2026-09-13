-- Vendas — regras que o Prisma não expressa: integridade (CHECK) e RLS das
-- tabelas de calendário, ingressos, clientes, carrinho, pedidos, pagamentos e
-- cupons. Ver docs/ARQUITETURA.md, seções 5 e 12.

-- ─── Calendário e ingressos ─────────────────────────────────────────────────

ALTER TABLE "park_days"
  ADD CONSTRAINT "park_days_capacity_non_negative" CHECK ("capacity" >= 0),
  ADD CONSTRAINT "park_days_opens_at_format" CHECK ("opens_at" IS NULL OR "opens_at" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  ADD CONSTRAINT "park_days_closes_at_format" CHECK ("closes_at" IS NULL OR "closes_at" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  ADD CONSTRAINT "park_days_hours_order" CHECK ("opens_at" IS NULL OR "closes_at" IS NULL OR "opens_at" < "closes_at");

ALTER TABLE "ticket_types"
  ADD CONSTRAINT "ticket_types_slug_format" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  ADD CONSTRAINT "ticket_types_name_not_blank" CHECK (length(btrim("name")) >= 2),
  ADD CONSTRAINT "ticket_types_base_price_non_negative" CHECK ("base_price_cents" >= 0),
  ADD CONSTRAINT "ticket_types_ages" CHECK (
    ("min_age" IS NULL OR "min_age" BETWEEN 0 AND 120)
    AND ("max_age" IS NULL OR "max_age" BETWEEN 0 AND 120)
    AND ("min_age" IS NULL OR "max_age" IS NULL OR "min_age" <= "max_age")
  ),
  ADD CONSTRAINT "ticket_types_people_per_ticket" CHECK ("people_per_ticket" BETWEEN 1 AND 20),
  ADD CONSTRAINT "ticket_types_daily_quota_positive" CHECK ("daily_quota" IS NULL OR "daily_quota" > 0),
  ADD CONSTRAINT "ticket_types_order_limits" CHECK (
    ("min_per_order" IS NULL OR "min_per_order" >= 1)
    AND ("max_per_order" IS NULL OR "max_per_order" >= 1)
    AND ("min_per_order" IS NULL OR "max_per_order" IS NULL OR "min_per_order" <= "max_per_order")
  ),
  ADD CONSTRAINT "ticket_types_customer_limit_positive" CHECK ("max_per_customer_per_day" IS NULL OR "max_per_customer_per_day" >= 1),
  ADD CONSTRAINT "ticket_types_channels_not_empty" CHECK (cardinality("channels") >= 1),
  ADD CONSTRAINT "ticket_types_availability_order" CHECK ("available_from" IS NULL OR "available_until" IS NULL OR "available_from" <= "available_until");

ALTER TABLE "ticket_prices"
  ADD CONSTRAINT "ticket_prices_name_not_blank" CHECK (length(btrim("name")) >= 2),
  ADD CONSTRAINT "ticket_prices_price_non_negative" CHECK ("price_cents" >= 0),
  ADD CONSTRAINT "ticket_prices_compare_at_higher" CHECK ("compare_at_cents" IS NULL OR "compare_at_cents" > "price_cents"),
  ADD CONSTRAINT "ticket_prices_lot_positive" CHECK ("lot_quantity" IS NULL OR "lot_quantity" > 0),
  ADD CONSTRAINT "ticket_prices_visit_order" CHECK ("visit_from" IS NULL OR "visit_until" IS NULL OR "visit_from" <= "visit_until"),
  ADD CONSTRAINT "ticket_prices_sale_order" CHECK ("sale_starts_at" IS NULL OR "sale_ends_at" IS NULL OR "sale_starts_at" < "sale_ends_at");

-- ─── Clientes ───────────────────────────────────────────────────────────────

ALTER TABLE "customers"
  ADD CONSTRAINT "customers_name_not_blank" CHECK (length(btrim("name")) >= 2),
  ADD CONSTRAINT "customers_email_normalized" CHECK ("email" = lower(btrim("email"))),
  ADD CONSTRAINT "customers_phone_e164" CHECK ("phone" IS NULL OR "phone" ~ '^55[0-9]{10,11}$'),
  ADD CONSTRAINT "customers_cpf_hash_format" CHECK ("cpf_hash" IS NULL OR "cpf_hash" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "customers_cpf_pair" CHECK (("cpf_hash" IS NULL) = ("cpf_masked" IS NULL));

-- ─── Carrinho e reservas ────────────────────────────────────────────────────

ALTER TABLE "cart_items"
  ADD CONSTRAINT "cart_items_quantity_positive" CHECK ("quantity" > 0);

ALTER TABLE "capacity_holds"
  ADD CONSTRAINT "capacity_holds_people_non_negative" CHECK ("people" >= 0),
  ADD CONSTRAINT "capacity_holds_owner" CHECK ("cart_id" IS NOT NULL OR "order_id" IS NOT NULL);

ALTER TABLE "capacity_hold_items"
  ADD CONSTRAINT "capacity_hold_items_quantity_positive" CHECK ("quantity" > 0);

ALTER TABLE "order_sequences"
  ADD CONSTRAINT "order_sequences_last_value_non_negative" CHECK ("last_value" >= 0);

-- ─── Pedidos e ingressos ────────────────────────────────────────────────────

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_amounts_non_negative" CHECK (
    "subtotal_cents" >= 0 AND "discount_cents" >= 0 AND "fee_cents" >= 0 AND "total_cents" >= 0
  ),
  ADD CONSTRAINT "orders_total_consistent" CHECK ("total_cents" = "subtotal_cents" - "discount_cents" + "fee_cents"),
  ADD CONSTRAINT "orders_discount_not_above_subtotal" CHECK ("discount_cents" <= "subtotal_cents"),
  ADD CONSTRAINT "orders_buyer_email_normalized" CHECK ("buyer_email" = lower(btrim("buyer_email"))),
  ADD CONSTRAINT "orders_buyer_phone_e164" CHECK ("buyer_phone" IS NULL OR "buyer_phone" ~ '^55[0-9]{10,11}$'),
  ADD CONSTRAINT "orders_confirmed_has_date" CHECK ("status" <> 'CONFIRMED' OR "confirmed_at" IS NOT NULL),
  ADD CONSTRAINT "orders_cancelled_has_date" CHECK ("status" <> 'CANCELLED' OR "cancelled_at" IS NOT NULL);

ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_quantity_positive" CHECK ("quantity" > 0),
  ADD CONSTRAINT "order_items_amounts_non_negative" CHECK (
    "unit_price_cents" >= 0 AND "discount_cents" >= 0 AND "total_cents" >= 0
  ),
  ADD CONSTRAINT "order_items_total_consistent" CHECK ("total_cents" = "quantity" * "unit_price_cents" - "discount_cents");

ALTER TABLE "tickets"
  ADD CONSTRAINT "tickets_code_format" CHECK ("code" ~ '^[0-9A-HJKMNP-TV-Z]{10}$'),
  ADD CONSTRAINT "tickets_price_non_negative" CHECK ("price_cents" >= 0),
  ADD CONSTRAINT "tickets_qr_version_positive" CHECK ("qr_version" >= 1),
  ADD CONSTRAINT "tickets_checked_in_has_date" CHECK ("status" <> 'CHECKED_IN' OR "checked_in_at" IS NOT NULL);

-- ─── Pagamentos ─────────────────────────────────────────────────────────────

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_amount_non_negative" CHECK ("amount_cents" >= 0),
  ADD CONSTRAINT "payments_fee_non_negative" CHECK ("fee_cents" IS NULL OR "fee_cents" >= 0),
  ADD CONSTRAINT "payments_refunded_within_amount" CHECK ("refunded_cents" >= 0 AND "refunded_cents" <= "amount_cents"),
  ADD CONSTRAINT "payments_approved_has_date" CHECK (
    "status" NOT IN ('APPROVED', 'PARTIALLY_REFUNDED', 'REFUNDED') OR "approved_at" IS NOT NULL
  );

ALTER TABLE "dev_mock_charges"
  ADD CONSTRAINT "dev_mock_charges_amount_non_negative" CHECK ("amount_cents" >= 0);

-- ─── Cupons ─────────────────────────────────────────────────────────────────

ALTER TABLE "coupons"
  ADD CONSTRAINT "coupons_code_format" CHECK ("code" ~ '^[A-Z0-9][A-Z0-9_-]{2,29}$'),
  ADD CONSTRAINT "coupons_discount_consistent" CHECK (
    ("discount_type" = 'PERCENT' AND "percent_bps" BETWEEN 1 AND 10000 AND "amount_cents" IS NULL)
    OR ("discount_type" = 'FIXED' AND "amount_cents" > 0 AND "percent_bps" IS NULL)
  ),
  ADD CONSTRAINT "coupons_limits_positive" CHECK (
    ("max_discount_cents" IS NULL OR "max_discount_cents" > 0)
    AND ("min_order_cents" IS NULL OR "min_order_cents" > 0)
    AND ("max_uses" IS NULL OR "max_uses" > 0)
    AND ("max_uses_per_customer" IS NULL OR "max_uses_per_customer" > 0)
  ),
  ADD CONSTRAINT "coupons_period_order" CHECK ("starts_at" IS NULL OR "ends_at" IS NULL OR "starts_at" < "ends_at"),
  ADD CONSTRAINT "coupons_visit_order" CHECK ("visit_from" IS NULL OR "visit_until" IS NULL OR "visit_from" <= "visit_until"),
  ADD CONSTRAINT "coupons_weekdays_valid" CHECK ("weekdays" <@ ARRAY[0, 1, 2, 3, 4, 5, 6]),
  ADD CONSTRAINT "coupons_channels_not_empty" CHECK (cardinality("channels") >= 1);

ALTER TABLE "coupon_usages"
  ADD CONSTRAINT "coupon_usages_discount_non_negative" CHECK ("discount_cents" >= 0);

-- ─── RLS ────────────────────────────────────────────────────────────────────
-- Mesmo critério da fase 1: ligado sem políticas, para a API automática do
-- Supabase não enxergar nada.

ALTER TABLE "park_days" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ticket_types" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ticket_prices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "carts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cart_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "capacity_holds" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "capacity_hold_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_sequences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tickets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ticket_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_transactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webhook_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dev_mock_charges" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "coupons" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "coupon_ticket_types" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "coupon_usages" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  papel text;
BEGIN
  FOREACH papel IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = papel) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', papel);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', papel);
    END IF;
  END LOOP;
END;
$$;
