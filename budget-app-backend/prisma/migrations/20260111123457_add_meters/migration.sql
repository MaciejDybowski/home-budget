-- CreateTable
CREATE TABLE "MeterType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "color" TEXT,
    "expectedMonthlyUsage" DOUBLE PRECISION,

    CONSTRAINT "MeterType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeterReading" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "meterTypeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeterReading_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MeterReading_meterTypeId_date_idx" ON "MeterReading"("meterTypeId", "date");

-- AddForeignKey
ALTER TABLE "MeterReading" ADD CONSTRAINT "MeterReading_meterTypeId_fkey" FOREIGN KEY ("meterTypeId") REFERENCES "MeterType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
