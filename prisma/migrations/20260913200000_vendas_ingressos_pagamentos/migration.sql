-- CreateEnum
CREATE TYPE "park_day_status" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "day_kind" AS ENUM ('WEEKDAY', 'WEEKEND', 'HOLIDAY', 'EVENT', 'SPECIAL');

-- CreateEnum
CREATE TYPE "ticket_category" AS ENUM ('ADULT', 'CHILD', 'HALF', 'SENIOR', 'PROMO', 'VIP', 'COURTESY', 'GROUP', 'EXCURSION', 'FAMILY', 'SPECIAL');

-- CreateEnum
CREATE TYPE "holder_data" AS ENUM ('NONE', 'NAME', 'NAME_BIRTHDATE', 'NAME_CPF', 'NAME_CPF_BIRTHDATE');

-- CreateEnum
CREATE TYPE "sales_channel" AS ENUM ('ONLINE', 'POS');

-- CreateEnum
CREATE TYPE "cart_status" AS ENUM ('ACTIVE', 'CONVERTED', 'EXPIRED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "hold_status" AS ENUM ('ACTIVE', 'CONVERTED', 'RELEASED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "order_status" AS ENUM ('PENDING_PAYMENT', 'CONFIRMED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "financial_status" AS ENUM ('UNPAID', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "order_channel" AS ENUM ('ONLINE', 'POS', 'COURTESY', 'ADMIN');

-- CreateEnum
CREATE TYPE "ticket_status" AS ENUM ('PENDING_PAYMENT', 'ACTIVE', 'CHECKED_IN', 'CANCELLED', 'REFUNDED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ticket_event_type" AS ENUM ('CREATED', 'ACTIVATED', 'CHECKED_IN', 'CANCELLED', 'REFUNDED', 'EXPIRED', 'REISSUED', 'RESENT', 'HOLDER_CHANGED');

-- CreateEnum
CREATE TYPE "payment_provider" AS ENUM ('MOCK', 'ASAAS');

-- CreateEnum
CREATE TYPE "payment_method" AS ENUM ('PIX', 'CREDIT_CARD', 'DEBIT_CARD', 'CASH', 'CARD_TERMINAL', 'COURTESY');

-- CreateEnum
CREATE TYPE "payment_status" AS ENUM ('AWAITING', 'PROCESSING', 'APPROVED', 'DECLINED', 'EXPIRED', 'CANCELLED', 'PARTIALLY_REFUNDED', 'REFUNDED', 'CHARGEBACK');

-- CreateEnum
CREATE TYPE "payment_transaction_kind" AS ENUM ('CREATED', 'STATUS_CHANGED', 'WEBHOOK', 'RECONCILED', 'ERROR');

-- CreateEnum
CREATE TYPE "webhook_status" AS ENUM ('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED');

-- CreateEnum
CREATE TYPE "coupon_discount_type" AS ENUM ('PERCENT', 'FIXED');

-- CreateEnum
CREATE TYPE "coupon_usage_status" AS ENUM ('RESERVED', 'CONFIRMED', 'RELEASED');

-- CreateTable
CREATE TABLE "park_days" (
    "id" UUID NOT NULL,
    "park_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "status" "park_day_status" NOT NULL DEFAULT 'OPEN',
    "opens_at" VARCHAR(5),
    "closes_at" VARCHAR(5),
    "capacity" INTEGER NOT NULL,
    "day_kind" "day_kind",
    "label" VARCHAR(80),
    "notes" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "park_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_types" (
    "id" UUID NOT NULL,
    "park_id" UUID NOT NULL,
    "slug" VARCHAR(60) NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "description" VARCHAR(300),
    "category" "ticket_category" NOT NULL,
    "base_price_cents" INTEGER NOT NULL,
    "min_age" INTEGER,
    "max_age" INTEGER,
    "holder_data" "holder_data" NOT NULL DEFAULT 'NAME',
    "requires_document" BOOLEAN NOT NULL DEFAULT false,
    "document_hint" VARCHAR(120),
    "occupies_capacity" BOOLEAN NOT NULL DEFAULT true,
    "people_per_ticket" INTEGER NOT NULL DEFAULT 1,
    "daily_quota" INTEGER,
    "min_per_order" INTEGER,
    "max_per_order" INTEGER,
    "max_per_customer_per_day" INTEGER,
    "channels" "sales_channel"[] DEFAULT ARRAY['ONLINE', 'POS']::"sales_channel"[],
    "available_from" DATE,
    "available_until" DATE,
    "rules_text" VARCHAR(1000),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ticket_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_prices" (
    "id" UUID NOT NULL,
    "ticket_type_id" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "price_cents" INTEGER NOT NULL,
    "compare_at_cents" INTEGER,
    "day_kinds" "day_kind"[] DEFAULT ARRAY[]::"day_kind"[],
    "visit_from" DATE,
    "visit_until" DATE,
    "sale_starts_at" TIMESTAMPTZ(3),
    "sale_ends_at" TIMESTAMPTZ(3),
    "lot_quantity" INTEGER,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ticket_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "park_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "phone" VARCHAR(13),
    "birth_date" DATE,
    "cpf_hash" CHAR(64),
    "cpf_masked" VARCHAR(14),
    "marketing_opt_in" BOOLEAN NOT NULL DEFAULT false,
    "notes" VARCHAR(2000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carts" (
    "id" UUID NOT NULL,
    "park_id" UUID NOT NULL,
    "park_day_id" UUID NOT NULL,
    "visit_date" DATE NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "status" "cart_status" NOT NULL DEFAULT 'ACTIVE',
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "order_id" UUID,
    "ip" VARCHAR(45),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "carts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart_items" (
    "id" UUID NOT NULL,
    "cart_id" UUID NOT NULL,
    "ticket_type_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "cart_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capacity_holds" (
    "id" UUID NOT NULL,
    "park_id" UUID NOT NULL,
    "park_day_id" UUID NOT NULL,
    "cart_id" UUID,
    "order_id" UUID,
    "people" INTEGER NOT NULL,
    "status" "hold_status" NOT NULL DEFAULT 'ACTIVE',
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "capacity_holds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capacity_hold_items" (
    "hold_id" UUID NOT NULL,
    "ticket_type_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "capacity_hold_items_pkey" PRIMARY KEY ("hold_id","ticket_type_id")
);

-- CreateTable
CREATE TABLE "order_sequences" (
    "park_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "last_value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "order_sequences_pkey" PRIMARY KEY ("park_id","year")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "park_id" UUID NOT NULL,
    "code" VARCHAR(24) NOT NULL,
    "customer_id" UUID,
    "buyer_name" VARCHAR(120) NOT NULL,
    "buyer_email" VARCHAR(254) NOT NULL,
    "buyer_phone" VARCHAR(13),
    "buyer_cpf_masked" VARCHAR(14),
    "park_day_id" UUID NOT NULL,
    "visit_date" DATE NOT NULL,
    "status" "order_status" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "financial_status" "financial_status" NOT NULL DEFAULT 'UNPAID',
    "channel" "order_channel" NOT NULL DEFAULT 'ONLINE',
    "subtotal_cents" INTEGER NOT NULL,
    "discount_cents" INTEGER NOT NULL DEFAULT 0,
    "fee_cents" INTEGER NOT NULL DEFAULT 0,
    "total_cents" INTEGER NOT NULL,
    "coupon_id" UUID,
    "sold_by_id" UUID,
    "authorized_by_id" UUID,
    "courtesy_reason" VARCHAR(300),
    "access_version" INTEGER NOT NULL DEFAULT 1,
    "expires_at" TIMESTAMPTZ(3),
    "confirmed_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "cancelled_by_id" UUID,
    "cancel_reason" VARCHAR(300),
    "idempotency_key" VARCHAR(80),
    "utm_source" VARCHAR(100),
    "utm_medium" VARCHAR(100),
    "utm_campaign" VARCHAR(100),
    "utm_content" VARCHAR(100),
    "utm_term" VARCHAR(100),
    "referrer" VARCHAR(300),
    "created_ip" VARCHAR(45),
    "user_agent" VARCHAR(400),
    "notes" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "ticket_type_id" UUID NOT NULL,
    "ticket_price_id" UUID,
    "ticket_type_name" VARCHAR(60) NOT NULL,
    "price_label" VARCHAR(60),
    "quantity" INTEGER NOT NULL,
    "unit_price_cents" INTEGER NOT NULL,
    "discount_cents" INTEGER NOT NULL DEFAULT 0,
    "total_cents" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" UUID NOT NULL,
    "park_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "ticket_type_id" UUID NOT NULL,
    "customer_id" UUID,
    "park_day_id" UUID NOT NULL,
    "visit_date" DATE NOT NULL,
    "code" VARCHAR(12) NOT NULL,
    "qr_version" INTEGER NOT NULL DEFAULT 1,
    "status" "ticket_status" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "holder_name" VARCHAR(120),
    "holder_birth_date" DATE,
    "holder_cpf_masked" VARCHAR(14),
    "holder_cpf_hash" CHAR(64),
    "is_courtesy" BOOLEAN NOT NULL DEFAULT false,
    "occupies_capacity" BOOLEAN NOT NULL DEFAULT true,
    "price_cents" INTEGER NOT NULL,
    "activated_at" TIMESTAMPTZ(3),
    "checked_in_at" TIMESTAMPTZ(3),
    "checked_in_by_id" UUID,
    "cancelled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_events" (
    "id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "type" "ticket_event_type" NOT NULL,
    "actor_user_id" UUID,
    "data" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "park_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "provider" "payment_provider" NOT NULL,
    "method" "payment_method" NOT NULL,
    "status" "payment_status" NOT NULL DEFAULT 'AWAITING',
    "amount_cents" INTEGER NOT NULL,
    "fee_cents" INTEGER,
    "net_cents" INTEGER,
    "refunded_cents" INTEGER NOT NULL DEFAULT 0,
    "provider_payment_id" VARCHAR(100),
    "pix_payload" VARCHAR(1000),
    "checkout_url" VARCHAR(500),
    "expires_at" TIMESTAMPTZ(3),
    "approved_at" TIMESTAMPTZ(3),
    "failure_code" VARCHAR(60),
    "failure_message" VARCHAR(300),
    "idempotency_key" VARCHAR(80) NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_transactions" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "kind" "payment_transaction_kind" NOT NULL,
    "from_status" "payment_status",
    "to_status" "payment_status",
    "amount_cents" INTEGER,
    "provider_reference" VARCHAR(120),
    "data" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" UUID NOT NULL,
    "provider" "payment_provider" NOT NULL,
    "external_id" VARCHAR(120) NOT NULL,
    "event_type" VARCHAR(80) NOT NULL,
    "verified" BOOLEAN NOT NULL,
    "status" "webhook_status" NOT NULL DEFAULT 'RECEIVED',
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" VARCHAR(500),
    "payment_id" UUID,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(3),

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dev_mock_charges" (
    "id" VARCHAR(60) NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "status" "payment_status" NOT NULL DEFAULT 'AWAITING',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "dev_mock_charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupons" (
    "id" UUID NOT NULL,
    "park_id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "description" VARCHAR(200),
    "discount_type" "coupon_discount_type" NOT NULL,
    "percent_bps" INTEGER,
    "amount_cents" INTEGER,
    "max_discount_cents" INTEGER,
    "min_order_cents" INTEGER,
    "starts_at" TIMESTAMPTZ(3),
    "ends_at" TIMESTAMPTZ(3),
    "visit_from" DATE,
    "visit_until" DATE,
    "weekdays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "max_uses" INTEGER,
    "max_uses_per_customer" INTEGER,
    "first_purchase_only" BOOLEAN NOT NULL DEFAULT false,
    "channels" "sales_channel"[] DEFAULT ARRAY['ONLINE', 'POS']::"sales_channel"[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupon_ticket_types" (
    "coupon_id" UUID NOT NULL,
    "ticket_type_id" UUID NOT NULL,

    CONSTRAINT "coupon_ticket_types_pkey" PRIMARY KEY ("coupon_id","ticket_type_id")
);

-- CreateTable
CREATE TABLE "coupon_usages" (
    "id" UUID NOT NULL,
    "coupon_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "customer_id" UUID,
    "cpf_hash" CHAR(64),
    "discount_cents" INTEGER NOT NULL,
    "status" "coupon_usage_status" NOT NULL DEFAULT 'RESERVED',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "coupon_usages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "park_days_park_id_date_key" ON "park_days"("park_id", "date");

-- CreateIndex
CREATE INDEX "ticket_types_park_id_is_active_sort_order_idx" ON "ticket_types"("park_id", "is_active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_types_park_id_slug_key" ON "ticket_types"("park_id", "slug");

-- CreateIndex
CREATE INDEX "ticket_prices_ticket_type_id_is_active_idx" ON "ticket_prices"("ticket_type_id", "is_active");

-- CreateIndex
CREATE INDEX "customers_park_id_email_idx" ON "customers"("park_id", "email");

-- CreateIndex
CREATE INDEX "customers_park_id_phone_idx" ON "customers"("park_id", "phone");

-- CreateIndex
CREATE INDEX "customers_park_id_created_at_idx" ON "customers"("park_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "customers_park_id_cpf_hash_key" ON "customers"("park_id", "cpf_hash");

-- CreateIndex
CREATE UNIQUE INDEX "carts_token_hash_key" ON "carts"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "carts_order_id_key" ON "carts"("order_id");

-- CreateIndex
CREATE INDEX "carts_park_id_status_expires_at_idx" ON "carts"("park_id", "status", "expires_at");

-- CreateIndex
CREATE INDEX "cart_items_ticket_type_id_idx" ON "cart_items"("ticket_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "cart_items_cart_id_ticket_type_id_key" ON "cart_items"("cart_id", "ticket_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "capacity_holds_cart_id_key" ON "capacity_holds"("cart_id");

-- CreateIndex
CREATE UNIQUE INDEX "capacity_holds_order_id_key" ON "capacity_holds"("order_id");

-- CreateIndex
CREATE INDEX "capacity_holds_park_day_id_status_expires_at_idx" ON "capacity_holds"("park_day_id", "status", "expires_at");

-- CreateIndex
CREATE INDEX "capacity_hold_items_ticket_type_id_idx" ON "capacity_hold_items"("ticket_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_idempotency_key_key" ON "orders"("idempotency_key");

-- CreateIndex
CREATE INDEX "orders_park_id_created_at_idx" ON "orders"("park_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "orders_park_id_status_expires_at_idx" ON "orders"("park_id", "status", "expires_at");

-- CreateIndex
CREATE INDEX "orders_park_id_visit_date_idx" ON "orders"("park_id", "visit_date");

-- CreateIndex
CREATE INDEX "orders_park_id_confirmed_at_idx" ON "orders"("park_id", "confirmed_at");

-- CreateIndex
CREATE INDEX "orders_park_id_buyer_email_idx" ON "orders"("park_id", "buyer_email");

-- CreateIndex
CREATE INDEX "orders_customer_id_idx" ON "orders"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_park_id_code_key" ON "orders"("park_id", "code");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE INDEX "order_items_ticket_type_id_idx" ON "order_items"("ticket_type_id");

-- CreateIndex
CREATE INDEX "order_items_ticket_price_id_idx" ON "order_items"("ticket_price_id");

-- CreateIndex
CREATE INDEX "tickets_order_id_idx" ON "tickets"("order_id");

-- CreateIndex
CREATE INDEX "tickets_park_day_id_status_idx" ON "tickets"("park_day_id", "status");

-- CreateIndex
CREATE INDEX "tickets_park_id_visit_date_status_idx" ON "tickets"("park_id", "visit_date", "status");

-- CreateIndex
CREATE INDEX "tickets_ticket_type_id_idx" ON "tickets"("ticket_type_id");

-- CreateIndex
CREATE INDEX "tickets_holder_cpf_hash_idx" ON "tickets"("holder_cpf_hash");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_park_id_code_key" ON "tickets"("park_id", "code");

-- CreateIndex
CREATE INDEX "ticket_events_ticket_id_created_at_idx" ON "ticket_events"("ticket_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "payments_idempotency_key_key" ON "payments"("idempotency_key");

-- CreateIndex
CREATE INDEX "payments_order_id_idx" ON "payments"("order_id");

-- CreateIndex
CREATE INDEX "payments_park_id_status_created_at_idx" ON "payments"("park_id", "status", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_provider_payment_id_key" ON "payments"("provider", "provider_payment_id");

-- CreateIndex
CREATE INDEX "payment_transactions_payment_id_created_at_idx" ON "payment_transactions"("payment_id", "created_at");

-- CreateIndex
CREATE INDEX "webhook_events_status_received_at_idx" ON "webhook_events"("status", "received_at");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_provider_external_id_key" ON "webhook_events"("provider", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "coupons_park_id_code_key" ON "coupons"("park_id", "code");

-- CreateIndex
CREATE INDEX "coupon_ticket_types_ticket_type_id_idx" ON "coupon_ticket_types"("ticket_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "coupon_usages_order_id_key" ON "coupon_usages"("order_id");

-- CreateIndex
CREATE INDEX "coupon_usages_coupon_id_status_idx" ON "coupon_usages"("coupon_id", "status");

-- CreateIndex
CREATE INDEX "coupon_usages_cpf_hash_idx" ON "coupon_usages"("cpf_hash");

-- AddForeignKey
ALTER TABLE "park_days" ADD CONSTRAINT "park_days_park_id_fkey" FOREIGN KEY ("park_id") REFERENCES "parks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_types" ADD CONSTRAINT "ticket_types_park_id_fkey" FOREIGN KEY ("park_id") REFERENCES "parks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_prices" ADD CONSTRAINT "ticket_prices_ticket_type_id_fkey" FOREIGN KEY ("ticket_type_id") REFERENCES "ticket_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_park_id_fkey" FOREIGN KEY ("park_id") REFERENCES "parks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carts" ADD CONSTRAINT "carts_park_id_fkey" FOREIGN KEY ("park_id") REFERENCES "parks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carts" ADD CONSTRAINT "carts_park_day_id_fkey" FOREIGN KEY ("park_day_id") REFERENCES "park_days"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carts" ADD CONSTRAINT "carts_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "carts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_ticket_type_id_fkey" FOREIGN KEY ("ticket_type_id") REFERENCES "ticket_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capacity_holds" ADD CONSTRAINT "capacity_holds_park_id_fkey" FOREIGN KEY ("park_id") REFERENCES "parks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capacity_holds" ADD CONSTRAINT "capacity_holds_park_day_id_fkey" FOREIGN KEY ("park_day_id") REFERENCES "park_days"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capacity_holds" ADD CONSTRAINT "capacity_holds_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "carts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capacity_holds" ADD CONSTRAINT "capacity_holds_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capacity_hold_items" ADD CONSTRAINT "capacity_hold_items_hold_id_fkey" FOREIGN KEY ("hold_id") REFERENCES "capacity_holds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capacity_hold_items" ADD CONSTRAINT "capacity_hold_items_ticket_type_id_fkey" FOREIGN KEY ("ticket_type_id") REFERENCES "ticket_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_sequences" ADD CONSTRAINT "order_sequences_park_id_fkey" FOREIGN KEY ("park_id") REFERENCES "parks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_park_id_fkey" FOREIGN KEY ("park_id") REFERENCES "parks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_park_day_id_fkey" FOREIGN KEY ("park_day_id") REFERENCES "park_days"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_sold_by_id_fkey" FOREIGN KEY ("sold_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_authorized_by_id_fkey" FOREIGN KEY ("authorized_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_cancelled_by_id_fkey" FOREIGN KEY ("cancelled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_ticket_type_id_fkey" FOREIGN KEY ("ticket_type_id") REFERENCES "ticket_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_ticket_price_id_fkey" FOREIGN KEY ("ticket_price_id") REFERENCES "ticket_prices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_park_id_fkey" FOREIGN KEY ("park_id") REFERENCES "parks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_ticket_type_id_fkey" FOREIGN KEY ("ticket_type_id") REFERENCES "ticket_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_park_day_id_fkey" FOREIGN KEY ("park_day_id") REFERENCES "park_days"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_checked_in_by_id_fkey" FOREIGN KEY ("checked_in_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_events" ADD CONSTRAINT "ticket_events_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_events" ADD CONSTRAINT "ticket_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_park_id_fkey" FOREIGN KEY ("park_id") REFERENCES "parks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_park_id_fkey" FOREIGN KEY ("park_id") REFERENCES "parks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_ticket_types" ADD CONSTRAINT "coupon_ticket_types_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_ticket_types" ADD CONSTRAINT "coupon_ticket_types_ticket_type_id_fkey" FOREIGN KEY ("ticket_type_id") REFERENCES "ticket_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_usages" ADD CONSTRAINT "coupon_usages_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_usages" ADD CONSTRAINT "coupon_usages_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_usages" ADD CONSTRAINT "coupon_usages_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
