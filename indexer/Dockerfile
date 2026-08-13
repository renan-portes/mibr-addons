# ── Stage 1: build ──────────────────────────────────────────────────────────
FROM node:24-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# ── Stage 2: runtime ─────────────────────────────────────────────────────────
FROM node:24-alpine AS runtime

LABEL maintainer="mibr-addons"
LABEL description="MIBR Indexer — self-hosted torrent indexer with FlareSolverr support"

RUN addgroup -S indexer && adduser -S indexer -G indexer

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY --from=builder /app/dist ./dist

ENV PORT=7001 \
    NODE_ENV=production \
    FLARESOLVERR_URL=http://flaresolverr:8191 \
    BLUDV_SITE_URL=https://bludvfilmes.xyz \
    TORRENTDOSFILMES_SITE_URL=https://torrentdosfilmes2.site

EXPOSE 7001

USER indexer

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:7001/health || exit 1

CMD ["node", "dist/server.js"]
