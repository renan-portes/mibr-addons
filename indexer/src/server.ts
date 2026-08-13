/**
 * MIBR Indexer — HTTP server
 *
 * Routes:
 *   GET /health                           — health check
 *   GET /indexers/bludv?imdb=tt&q=&limit= — BluDV search
 *   GET /indexers/comando?imdb=tt&q=      — Comando Torrents search
 *   GET /indexers/torrentdosfilmes?...    — TorrentDosFilmes search
 *
 * ENV:
 *   PORT                    — listen port (default: 7001)
 *   FLARESOLVERR_URL        — FlareSolverr URL (default: http://flaresolverr:8191)
 *   BLUDV_SITE_URL          — BluDV site base URL
 *   TORRENTDOSFILMES_SITE_URL — TorrentDosFilmes site base URL
 *   INDEXER_CACHE_TTL_SEC   — Cache TTL in seconds (default: 3600)
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { SimpleCache } from "./cache.js";
import { scrapeBluDV } from "./indexers/bludv.js";
import { scrapeComando } from "./indexers/comando.js";
import { scrapeMicoLeao } from "./indexers/micoleao.js";
import { scrapeTorrentDosFilmes } from "./indexers/torrentdosfilmes.js";
import type { IndexerRequest, IndexerResponse } from "./types.js";

const PORT = Number(process.env.PORT ?? 7001);
const REQUEST_TIMEOUT_MS = 35_000;
const CACHE_TTL_SEC = Number(process.env.INDEXER_CACHE_TTL_SEC ?? 3600);

const indexerCache = new SimpleCache<IndexerResponse>(CACHE_TTL_SEC, 1000);

function parseRequest(url: URL): IndexerRequest {
  return {
    imdb: url.searchParams.get("imdb") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
    limit: url.searchParams.has("limit") ? Number(url.searchParams.get("limit")) : undefined,
  };
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Content-Length": Buffer.byteLength(data),
  });
  res.end(data);
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method === "OPTIONS") {
    res.writeHead(204, { "Access-Control-Allow-Origin": "*" });
    res.end();
    return;
  }

  const baseUrl = `http://localhost:${PORT}`;
  const url = new URL(req.url ?? "/", baseUrl);

  // Health check
  if (url.pathname === "/health") {
    sendJson(res, 200, { status: "ok", uptime: process.uptime() });
    return;
  }

  // Indexer routes
  const ROUTES: Record<string, (req: IndexerRequest, signal: AbortSignal) => Promise<IndexerResponse>> = {
    "/indexers/bludv": scrapeBluDV,
    "/indexers/comando": scrapeComando,
    "/indexers/micoleao": scrapeMicoLeao,
    "/indexers/torrentdosfilmes": scrapeTorrentDosFilmes,
  };

  const handler = ROUTES[url.pathname];
  if (!handler) {
    sendJson(res, 404, { error: `Unknown route: ${url.pathname}`, results: [], count: 0 });
    return;
  }

  const indexerReq = parseRequest(url);

  // Check cache first for <50ms response speed
  const cacheKey = `${url.pathname}?imdb=${indexerReq.imdb ?? ""}&q=${indexerReq.q ?? ""}&limit=${indexerReq.limit ?? ""}`;
  const cached = indexerCache.get(cacheKey);
  if (cached) {
    sendJson(res, 200, cached);
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const result = await handler(indexerReq, controller.signal);
    if (result.results && result.results.length > 0) {
      indexerCache.set(cacheKey, result);
    }
    sendJson(res, 200, result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error(`[indexer] Error on ${url.pathname}:`, message);
    sendJson(res, 500, { error: message, results: [], count: 0 });
  } finally {
    clearTimeout(timeout);
  }
}

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  handleRequest(req, res).catch((err) => {
    console.error("[indexer] Unhandled error:", err);
    if (!res.headersSent) {
      sendJson(res, 500, { error: "Unhandled server error", results: [], count: 0 });
    }
  });
});

server.listen(PORT, () => {
  console.log(`MIBR Indexer listening on port ${PORT}`);
  console.log(`  FlareSolverr: ${process.env.FLARESOLVERR_URL ?? "http://flaresolverr:8191"}`);
  console.log(`  BluDV site:   ${process.env.BLUDV_SITE_URL ?? "https://bludvfilmes.xyz"}`);
  console.log(`  TDF site:     ${process.env.TORRENTDOSFILMES_SITE_URL ?? "https://torrentdosfilmes2.site"}`);
  console.log(`  Cache TTL:    ${CACHE_TTL_SEC}s`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  server.close(() => {
    console.log("[indexer] Server closed");
    process.exit(0);
  });
});
