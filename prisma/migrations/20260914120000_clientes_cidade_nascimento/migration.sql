-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "city" VARCHAR(80),
ADD COLUMN     "state" CHAR(2);


-- UF com duas letras maiúsculas.
ALTER TABLE "customers" ADD CONSTRAINT "customers_state_uf" CHECK ("state" IS NULL OR "state" ~ '^[A-Z]{2}$');
