FROM node:24-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS builder
COPY package*.json ./
RUN npm ci
COPY . .
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build npm run build

FROM base AS runner
LABEL org.opencontainers.image.authors="Maciej Dybowski (https://github.com/MaciejDybowski)" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.source="https://github.com/MaciejDybowski/home-budget"
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/dist ./dist
COPY prisma ./prisma
COPY prisma.config.js ./
COPY scripts ./scripts
COPY LICENSE ./LICENSE
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
