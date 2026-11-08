ALTER TABLE "Income" ADD COLUMN "accountId" TEXT,
  ADD COLUMN "externalId" TEXT, ADD COLUMN "raw" JSONB, ADD COLUMN "importId" TEXT;
CREATE UNIQUE INDEX "Income_accountId_externalId_key" ON "Income"("accountId", "externalId");
CREATE INDEX "Income_importId_idx" ON "Income"("importId");
ALTER TABLE "Income" ADD CONSTRAINT "Income_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Income" ADD CONSTRAINT "Income_importId_fkey" FOREIGN KEY ("importId") REFERENCES "ImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE TABLE "CsvImportTemplate" (
  "id" TEXT NOT NULL, "accountId" TEXT NOT NULL, "name" TEXT NOT NULL,
  "config" JSONB NOT NULL, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CsvImportTemplate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CsvImportTemplate_accountId_name_key" ON "CsvImportTemplate"("accountId", "name");
ALTER TABLE "CsvImportTemplate" ADD CONSTRAINT "CsvImportTemplate_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BankAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
