#!/bin/sh
set -eu

cd "$(dirname "$0")/../budget-app-backend"
: "${DATABASE_URL:?Set the pooled Neon connection string in Render}"
: "${DATABASE_URL_UNPOOLED:?Set the direct Neon connection string in Render}"

# Free Render services have no pre-deploy command. Never migrate during builds.
# A failed migration stops startup; demo seeding is intentionally not automatic.
npm run db:deploy
exec node dist/main.js
