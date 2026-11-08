# Build stage
FROM node:24-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage z nginx
FROM nginx:stable-alpine
LABEL org.opencontainers.image.authors="Maciej Dybowski (https://github.com/MaciejDybowski)" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.source="https://github.com/MaciejDybowski/home-budget"
COPY LICENSE /usr/share/nginx/html/LICENSE
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
