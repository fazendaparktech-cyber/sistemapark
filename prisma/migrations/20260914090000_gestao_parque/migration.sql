-- Gestão do parque: venda presencial (MANUAL), preços por tipo de regra, portaria, notificações,
-- rastreamento e logo. Gerado por prisma migrate diff e revisado: nenhum DROP de dado.

-- CreateEnum
CREATE TYPE "price_rule_kind" AS ENUM ('CUSTOM', 'WEEKEND', 'HOLIDAY', 'PROMO', 'SPECIAL_DATE');

-- CreateEnum
CREATE TYPE "checkin_method" AS ENUM ('QR', 'MANUAL');

-- CreateEnum
CREATE TYPE "checkin_result" AS ENUM ('ALLOWED', 'DENIED');

-- CreateEnum
CREATE TYPE "checkin_reason" AS ENUM ('ALREADY_USED', 'CANCELLED', 'REFUNDED', 'PENDING_PAYMENT', 'EXPIRED', 'WRONG_DATE', 'NOT_FOUND', 'INVALID_QR');

-- CreateEnum
CREATE TYPE "notification_type" AS ENUM ('CAPACITY', 'PAYMENT_PROBLEM', 'TICKET_EMISSION', 'EMAIL_FAILURE', 'WHATSAPP_FAILURE', 'DUPLICATE_CHECKIN');

-- CreateEnum
CREATE TYPE "notification_severity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "tracking_event_type" AS ENUM ('VIEW_TICKETS', 'CHECKOUT_STARTED', 'PAYMENT_STARTED', 'PURCHASE');

-- AlterEnum
ALTER TYPE "payment_provider" ADD VALUE 'MANUAL';

-- AlterTable
ALTER TABLE "customers" ALTER COLUMN "email" DROP NOT NULL;

-- AlterTable
ALTER TABLE "orders" ALTER COLUMN "buyer_email" DROP NOT NULL;

-- AlterTable
ALTER TABLE "parks" ADD COLUMN     "logo_data" BYTEA,
ADD COLUMN     "logo_mime" VARCHAR(30),
ADD COLUMN     "logo_updated_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "ticket_prices" ADD COLUMN     "kind" "price_rule_kind" NOT NULL DEFAULT 'CUSTOM';

-- CreateTable
CREATE TABLE "checkin_attempts" (
    "id" UUID NOT NULL,
    "park_id" UUID NOT NULL,
    "ticket_id" UUID,
    "user_id" UUID,
    "method" "checkin_method" NOT NULL,
    "result" "checkin_result" NOT NULL,
    "reason" "checkin_reason",
    "code_tried" VARCHAR(40),
    "device" VARCHAR(120),
    "ip" VARCHAR(45),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checkin_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "park_id" UUID NOT NULL,
    "type" "notification_type" NOT NULL,
    "severity" "notification_severity" NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "body" VARCHAR(500) NOT NULL,
    "href" VARCHAR(300),
    "permission" VARCHAR(60) NOT NULL,
    "dedupe_key" VARCHAR(160) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_reads" (
    "notification_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "read_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_reads_pkey" PRIMARY KEY ("notification_id","user_id")
);

-- CreateTable
CREATE TABLE "tracking_events" (
    "id" UUID NOT NULL,
    "park_id" UUID NOT NULL,
    "type" "tracking_event_type" NOT NULL,
    "visitor_id" VARCHAR(40),
    "order_id" UUID,
    "value_cents" INTEGER,
    "utm_source" VARCHAR(100),
    "utm_medium" VARCHAR(100),
    "utm_campaign" VARCHAR(100),
    "utm_content" VARCHAR(100),
    "referrer" VARCHAR(300),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tracking_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "checkin_attempts_park_id_created_at_idx" ON "checkin_attempts"("park_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "checkin_attempts_ticket_id_created_at_idx" ON "checkin_attempts"("ticket_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_park_id_created_at_idx" ON "notifications"("park_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "notifications_park_id_dedupe_key_key" ON "notifications"("park_id", "dedupe_key");

-- CreateIndex
CREATE INDEX "notification_reads_user_id_idx" ON "notification_reads"("user_id");

-- CreateIndex
CREATE INDEX "tracking_events_park_id_type_created_at_idx" ON "tracking_events"("park_id", "type", "created_at");

-- CreateIndex
CREATE INDEX "tracking_events_order_id_idx" ON "tracking_events"("order_id");

-- AddForeignKey
ALTER TABLE "checkin_attempts" ADD CONSTRAINT "checkin_attempts_park_id_fkey" FOREIGN KEY ("park_id") REFERENCES "parks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkin_attempts" ADD CONSTRAINT "checkin_attempts_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkin_attempts" ADD CONSTRAINT "checkin_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_park_id_fkey" FOREIGN KEY ("park_id") REFERENCES "parks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_reads" ADD CONSTRAINT "notification_reads_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_reads" ADD CONSTRAINT "notification_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracking_events" ADD CONSTRAINT "tracking_events_park_id_fkey" FOREIGN KEY ("park_id") REFERENCES "parks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracking_events" ADD CONSTRAINT "tracking_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
