-- CreateEnum
CREATE TYPE "finance_entry_type" AS ENUM ('INCOME', 'EXPENSE');

-- CreateTable
CREATE TABLE "finance_entries" (
    "id" UUID NOT NULL,
    "park_id" UUID NOT NULL,
    "type" "finance_entry_type" NOT NULL,
    "category" VARCHAR(40) NOT NULL,
    "description" VARCHAR(120) NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "paid" BOOLEAN NOT NULL DEFAULT true,
    "notes" VARCHAR(500),
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "finance_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "finance_entries_park_id_date_idx" ON "finance_entries"("park_id", "date");

-- AddForeignKey
ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_park_id_fkey" FOREIGN KEY ("park_id") REFERENCES "parks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Valor sempre positivo: o tipo (receita ou despesa) diz se soma ou subtrai.
ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_amount_positive" CHECK ("amount_cents" > 0);

-- Mesmo padrão das demais tabelas: acesso só pelo servidor.
ALTER TABLE "finance_entries" ENABLE ROW LEVEL SECURITY;
