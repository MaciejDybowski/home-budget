-- Existing records and identifiers are preserved. Legacy aggregates remain marked LEGACY.
ALTER TABLE "Expense" ALTER COLUMN "amount" TYPE DECIMAL(14,2) USING ROUND("amount"::numeric, 2);
ALTER TABLE "Income" ALTER COLUMN "amount" TYPE DECIMAL(14,2) USING ROUND("amount"::numeric, 2);
ALTER TABLE "Category" ADD COLUMN "excludedFromBudget" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Expense"
  ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'EXPENSE',
  ADD COLUMN "origin" TEXT NOT NULL DEFAULT 'LEGACY',
  ADD COLUMN "merchant" TEXT,
  ADD COLUMN "excludedFromBudget" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "accountId" TEXT,
  ADD COLUMN "externalId" TEXT,
  ADD COLUMN "bookingDate" TIMESTAMP(3),
  ADD COLUMN "raw" JSONB,
  ADD COLUMN "importId" TEXT;

CREATE TABLE "BankAccount" ("id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "number" TEXT);
CREATE UNIQUE INDEX "BankAccount_number_key" ON "BankAccount"("number");
CREATE TABLE "ImportBatch" (
  "id" TEXT PRIMARY KEY, "filename" TEXT NOT NULL, "accountId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ImportBatch_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_importId_fkey" FOREIGN KEY ("importId") REFERENCES "ImportBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Expense_accountId_externalId_key" ON "Expense"("accountId", "externalId");
CREATE INDEX "Expense_date_idx" ON "Expense"("date");
CREATE INDEX "Expense_importId_idx" ON "Expense"("importId");
CREATE TABLE "MerchantRule" (
  "id" TEXT PRIMARY KEY, "pattern" TEXT NOT NULL, "merchant" TEXT NOT NULL,
  "categoryId" TEXT, "kind" TEXT NOT NULL DEFAULT 'EXPENSE'
);
CREATE UNIQUE INDEX "MerchantRule_pattern_key" ON "MerchantRule"("pattern");
CREATE TABLE "MonthlyBudget" (
  "month" TEXT PRIMARY KEY, "amount" DECIMAL(14,2) NOT NULL,
  "categoryLimits" JSONB NOT NULL DEFAULT '{}'
);
CREATE TABLE "SavingsGoal" (
  "id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "target" DECIMAL(14,2) NOT NULL,
  "initialAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "startDate" TIMESTAMP(3) NOT NULL, "deadline" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "GoalContribution" (
  "id" TEXT PRIMARY KEY, "goalId" TEXT NOT NULL, "amount" DECIMAL(14,2) NOT NULL, "date" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GoalContribution_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "SavingsGoal"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_kind_check" CHECK ("kind" IN ('EXPENSE','REFUND','TRANSFER','LOAN_OVERPAYMENT'));
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_amount_check" CHECK ("amount" > 0) NOT VALID;
ALTER TABLE "Income" ADD CONSTRAINT "Income_amount_check" CHECK ("amount" > 0) NOT VALID;
