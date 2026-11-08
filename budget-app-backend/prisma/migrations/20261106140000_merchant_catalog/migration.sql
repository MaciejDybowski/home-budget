CREATE TABLE "Merchant" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "Merchant_normalizedName_key" ON "Merchant"("normalizedName");
CREATE TABLE "MerchantAlias" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "key" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "MerchantAlias_key_merchantId_key" ON "MerchantAlias"("key", "merchantId");
ALTER TABLE "Expense" ADD COLUMN "merchantId" TEXT REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Expense_merchantId_idx" ON "Expense"("merchantId");
ALTER TABLE "MerchantRule" ADD COLUMN "merchantId" TEXT REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed only explicit merchant labels. Legacy descriptions are never guessed.
WITH names AS (
  SELECT "merchant" AS name FROM "Expense"
  UNION ALL SELECT "merchant" FROM "MerchantRule"
  UNION ALL SELECT "raw" #>> '{manualOriginal,merchant}' FROM "Expense"
), cleaned AS (
  SELECT regexp_replace(btrim(normalize(name, NFKC)), '[[:space:]]+', ' ', 'g') AS name
  FROM names WHERE name IS NOT NULL
), grouped AS (
  SELECT lower(name) AS key, min(name) AS name FROM cleaned WHERE name <> '' GROUP BY lower(name)
)
INSERT INTO "Merchant" ("id", "name", "normalizedName")
SELECT gen_random_uuid()::text, name, key FROM grouped;

UPDATE "Expense" e SET "merchantId" = m.id, "merchant" = m.name FROM "Merchant" m
WHERE m."normalizedName" = lower(regexp_replace(btrim(normalize(e.merchant, NFKC)), '[[:space:]]+', ' ', 'g'));
UPDATE "MerchantRule" r SET "merchantId" = m.id, "merchant" = m.name FROM "Merchant" m
WHERE m."normalizedName" = lower(regexp_replace(btrim(normalize(r.merchant, NFKC)), '[[:space:]]+', ' ', 'g'));
UPDATE "Expense" e SET raw = jsonb_set(e.raw, '{manualOriginal,merchantId}', to_jsonb(m.id)) FROM "Merchant" m
WHERE e.raw #>> '{manualOriginal,merchant}' IS NOT NULL
  AND m."normalizedName" = lower(regexp_replace(btrim(normalize(e.raw #>> '{manualOriginal,merchant}', NFKC)), '[[:space:]]+', ' ', 'g'));

-- Learn exact recipients, never generic payment processors.
INSERT INTO "MerchantAlias" (id, key, "merchantId")
SELECT gen_random_uuid()::text, key, "merchantId" FROM (
  SELECT DISTINCT 'recipient:' || lower(regexp_replace(btrim(normalize(raw->>'counterparty', NFKC)), '[[:space:]]+', ' ', 'g')) AS key, "merchantId"
  FROM "Expense"
  WHERE origin = 'BANK' AND kind IN ('EXPENSE','REFUND') AND "merchantId" IS NOT NULL
    AND length(btrim(raw->>'counterparty')) >= 3
    AND (raw->>'counterparty') !~* '\m(payu|paypro|autopay|przelewy24|paypal)\M'
) aliases ON CONFLICT DO NOTHING;

INSERT INTO "MerchantAlias" (id, key, "merchantId")
SELECT gen_random_uuid()::text, 'domain:' || domain, "merchantId" FROM (
  SELECT DISTINCT regexp_replace(lower(matches[1]), '^www\.', '') AS domain, e."merchantId"
  FROM "Expense" e
  CROSS JOIN LATERAL regexp_matches(coalesce(e.raw->>'title',''), '([a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,})', 'gi') AS matches
  WHERE e.origin = 'BANK' AND e.kind IN ('EXPENSE','REFUND') AND e."merchantId" IS NOT NULL
) aliases
WHERE domain NOT IN ('payu.pl','payu.com','paypro.pl','przelewy24.pl','autopay.pl','paypal.com')
ON CONFLICT DO NOTHING;
