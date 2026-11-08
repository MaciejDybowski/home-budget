CREATE TABLE "RecurringCharge" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'SUBSCRIPTION',
  "amount" DECIMAL(14,2) NOT NULL,
  "intervalMonths" INTEGER NOT NULL DEFAULT 1,
  "anchorDate" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "categoryId" TEXT,
  "matchPattern" TEXT,
  "website" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RecurringCharge_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "RecurringCharge_type_check" CHECK ("type" IN ('SUBSCRIPTION','FIXED')),
  CONSTRAINT "RecurringCharge_status_check" CHECK ("status" IN ('ACTIVE','PAUSED','ENDED')),
  CONSTRAINT "RecurringCharge_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "RecurringCharge_interval_check" CHECK ("intervalMonths" BETWEEN 1 AND 120)
);
CREATE TABLE "ChargePayment" (
  "id" TEXT PRIMARY KEY,
  "chargeId" TEXT NOT NULL,
  "expenseId" TEXT NOT NULL,
  "dueDate" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChargePayment_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "RecurringCharge"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ChargePayment_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ChargePayment_expenseId_key" ON "ChargePayment"("expenseId");
CREATE UNIQUE INDEX "ChargePayment_chargeId_dueDate_key" ON "ChargePayment"("chargeId", "dueDate");
