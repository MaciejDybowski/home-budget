// prisma.config.js
require('dotenv').config();
const { defineConfig, env } = require('prisma/config');

module.exports = defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Neon uses a pooled URL at runtime and a direct URL for migrations.
    // Existing Compose installations only need DATABASE_URL as before.
    url:
      process.env.DATABASE_URL_UNPOOLED ||
      process.env.DIRECT_URL ||
      env('DATABASE_URL'),
  },
});
