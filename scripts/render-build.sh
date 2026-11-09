#!/bin/sh
set -eu

cd "$(dirname "$0")/.."

# Render builds run on separate pipeline compute (8 GB on Starter), not the
# 512 MB runtime instance. Vue type-checking needs more heap than the server.
export NODE_OPTIONS=--max-old-space-size=1536

# Build tooling is needed even when Render sets NODE_ENV=production.
npm --prefix budget-app ci --include=dev
VITE_DEMO_MODE=false npm --prefix budget-app run build
npm --prefix budget-app-backend ci --include=dev

# Prisma generation/build must not require credentials or a live database.
DATABASE_URL=postgresql://build:build@localhost:5432/build \
  DATABASE_URL_UNPOOLED=postgresql://build:build@localhost:5432/build \
  DIRECT_URL=postgresql://build:build@localhost:5432/build \
  npm --prefix budget-app-backend run build

mkdir -p budget-app-backend/public
cp -R budget-app/dist/. budget-app-backend/public/
npm --prefix budget-app-backend prune --omit=dev
