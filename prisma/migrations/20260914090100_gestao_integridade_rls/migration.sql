-- Gestão do parque: portaria, notificações, rastreamento e logo.
-- Regras que o Prisma não expressa: CHECKs e RLS das tabelas novas.

-- ─── Parque: logo ───────────────────────────────────────────────────────────
ALTER TABLE "parks"
  ADD CONSTRAINT "parks_logo_consistente" CHECK (("logo_data" IS NULL) = ("logo_mime" IS NULL)),
  ADD CONSTRAINT "parks_logo_tipo" CHECK ("logo_mime" IS NULL OR "logo_mime" IN ('image/png', 'image/jpeg', 'image/webp')),
  ADD CONSTRAINT "parks_logo_tamanho" CHECK ("logo_data" IS NULL OR octet_length("logo_data") <= 300000);

-- ─── Portaria ───────────────────────────────────────────────────────────────
ALTER TABLE "checkin_attempts"
  ADD CONSTRAINT "checkin_attempts_motivo_confere" CHECK (
    ("result" = 'ALLOWED' AND "reason" IS NULL) OR ("result" = 'DENIED' AND "reason" IS NOT NULL)
  ),
  ADD CONSTRAINT "checkin_attempts_liberada_tem_ingresso" CHECK ("result" = 'DENIED' OR "ticket_id" IS NOT NULL),
  ADD CONSTRAINT "checkin_attempts_codigo" CHECK ("code_tried" IS NULL OR char_length("code_tried") BETWEEN 1 AND 40);

-- ─── Notificações ───────────────────────────────────────────────────────────
ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_titulo" CHECK (char_length(btrim("title")) > 0),
  ADD CONSTRAINT "notifications_link_interno" CHECK ("href" IS NULL OR ("href" LIKE '/%' AND "href" NOT LIKE '//%')),
  ADD CONSTRAINT "notifications_chave" CHECK (char_length("dedupe_key") > 0);

-- ─── Rastreamento ───────────────────────────────────────────────────────────
ALTER TABLE "tracking_events"
  ADD CONSTRAINT "tracking_events_valor" CHECK ("value_cents" IS NULL OR "value_cents" >= 0);

-- ─── RLS: o acesso é só pelo servidor ───────────────────────────────────────
ALTER TABLE "checkin_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_reads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tracking_events" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  papel text;
BEGIN
  FOREACH papel IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = papel) THEN
      EXECUTE format(
        'REVOKE ALL ON TABLE "checkin_attempts", "notifications", "notification_reads", "tracking_events" FROM %I',
        papel
      );
    END IF;
  END LOOP;
END;
$$;
