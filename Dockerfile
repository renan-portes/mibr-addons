# ── Stage 1: build ──────────────────────────────────────────────────────────
FROM node:24-alpine AS builder

WORKDIR /app

# Install dependencies first (layer cache friendly)
COPY package*.json ./
RUN npm ci --ignore-scripts || npm install --ignore-scripts

# Copy source and compile TypeScript
COPY tsconfig*.json ./
COPY src/ ./src/
RUN npm run build

# ── Stage 2: runtime ─────────────────────────────────────────────────────────
FROM node:24-alpine AS runtime

LABEL maintainer="mibr-addons"
LABEL description="MIBR Addons — Stremio addon server"

# Non-root user for security
RUN addgroup -S addon && adduser -S addon -G addon

WORKDIR /app

# Copy only production dependencies + compiled output
COPY package*.json ./
RUN (npm ci --omit=dev --ignore-scripts || npm install --omit=dev --ignore-scripts) && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY mibr-logo*.png ./

# Runtime configuration defaults (override via env or .env file)
ENV PORT=7000 \
    NODE_ENV=production \
    STREAM_CACHE_TTL_SECONDS=300 \
    STREAM_CACHE_MAX_ENTRIES=500

EXPOSE 7000

USER addon

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:7000/manifest.json || exit 1

CMD ["node", "dist/index.js"]
