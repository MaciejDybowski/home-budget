CREATE TABLE "AuthAccount" (
    "id" INTEGER NOT NULL DEFAULT 1 PRIMARY KEY CHECK ("id" = 1),
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
