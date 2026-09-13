-- Fase 1 — regras que o Prisma não expressa: integridade (CHECK), auditoria
-- imutável (trigger) e RLS. Ver docs/ARQUITETURA.md, seções 5 e 12.

-- ─── Integridade ────────────────────────────────────────────────────────────

-- E-mail da equipe sempre minúsculo e sem espaços nas pontas: uma pessoa, uma conta.
ALTER TABLE "users"
  ADD CONSTRAINT "users_email_normalized" CHECK ("email" = lower(btrim("email"))),
  ADD CONSTRAINT "users_name_not_blank" CHECK (length(btrim("name")) >= 3),
  ADD CONSTRAINT "users_phone_e164" CHECK ("phone" IS NULL OR "phone" ~ '^55[0-9]{10,11}$');

ALTER TABLE "parks"
  ADD CONSTRAINT "parks_slug_format" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  ADD CONSTRAINT "parks_order_code_prefix_format" CHECK ("order_code_prefix" ~ '^[A-Z]{1,6}$'),
  ADD CONSTRAINT "parks_cnpj_digits" CHECK ("cnpj" IS NULL OR "cnpj" ~ '^[0-9]{14}$'),
  ADD CONSTRAINT "parks_phone_e164" CHECK ("phone" IS NULL OR "phone" ~ '^55[0-9]{10,11}$'),
  ADD CONSTRAINT "parks_whatsapp_e164" CHECK ("whatsapp" IS NULL OR "whatsapp" ~ '^55[0-9]{10,11}$'),
  ADD CONSTRAINT "parks_state_format" CHECK ("state" IS NULL OR "state" ~ '^[A-Z]{2}$'),
  ADD CONSTRAINT "parks_postal_code_digits" CHECK ("postal_code" IS NULL OR "postal_code" ~ '^[0-9]{8}$');

ALTER TABLE "roles"
  ADD CONSTRAINT "roles_key_format" CHECK ("key" ~ '^[A-Z][A-Z_]*$');

ALTER TABLE "permissions"
  ADD CONSTRAINT "permissions_key_format" CHECK ("key" ~ '^[a-z_]+\.[a-z_]+$');

ALTER TABLE "sessions"
  ADD CONSTRAINT "sessions_expires_after_creation" CHECK ("expires_at" > "created_at");

ALTER TABLE "password_reset_tokens"
  ADD CONSTRAINT "password_reset_tokens_expires_after_creation" CHECK ("expires_at" > "created_at");

ALTER TABLE "rate_limits"
  ADD CONSTRAINT "rate_limits_count_positive" CHECK ("count" > 0);

-- ─── Auditoria somente-inclusão ─────────────────────────────────────────────

CREATE FUNCTION "audit_logs_block_changes"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs é somente-inclusão: % não é permitido', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER "audit_logs_no_update_delete"
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION "audit_logs_block_changes"();

CREATE TRIGGER "audit_logs_no_truncate"
  BEFORE TRUNCATE ON "audit_logs"
  FOR EACH STATEMENT EXECUTE FUNCTION "audit_logs_block_changes"();

-- ─── RLS ────────────────────────────────────────────────────────────────────
-- Ligado sem políticas, de propósito: os papéis da API automática do Supabase
-- (anon, authenticated) não leem nem gravam nada. O sistema conecta como dono
-- das tabelas, que não é afetado. Toda migration que cria tabela repete isto —
-- um teste de integração confere.

ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "parks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "permissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "role_permissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "password_reset_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "rate_limits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "system_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;

-- No Supabase, tira também as permissões que a API automática ganha por padrão
-- nas tabelas atuais e nas futuras. Em Postgres comum esses papéis não existem.
DO $$
DECLARE
  papel text;
BEGIN
  FOREACH papel IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = papel) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', papel);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', papel);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', papel);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', papel);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', papel);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', papel);
    END IF;
  END LOOP;
END;
$$;
