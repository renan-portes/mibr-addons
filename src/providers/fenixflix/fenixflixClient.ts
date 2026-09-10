import type { StremioCatalog, StremioCatalogResponse, StremioStreamResponse } from "../../types/stremio.js";

export interface FenixFlixClientOptions {
  readonly enabled?: boolean;
  readonly upstreamUrl?: string;
  readonly timeoutMs?: number;
  readonly catalogTtlMs?: number;
  readonly streamTtlMs?: number;
}

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

export class FenixFlixClient {
  private readonly enabled: boolean;
  private readonly upstreamUrl: string;
  private readonly timeoutMs: number;
  private readonly catalogTtlMs: number;
  private readonly streamTtlMs: number;

  private catalogCache = new Map<string, CacheEntry<StremioCatalogResponse>>();
  private streamCache = new Map<string, CacheEntry<StremioStreamResponse>>();

  constructor(options?: FenixFlixClientOptions) {
    const envEnabled = process.env.ENABLE_FENIXFLIX;
    this.enabled = options?.enabled ?? (envEnabled !== "false" && envEnabled !== "0");
    this.upstreamUrl = (options?.upstreamUrl ?? process.env.FENIXFLIX_UPSTREAM_URL ?? "https://fenixflix.fenixhub.online").replace(/\/$/, "");
    this.timeoutMs = options?.timeoutMs ?? 5000;
    this.catalogTtlMs = options?.catalogTtlMs ?? 5 * 60 * 1000; // 5 min
    this.streamTtlMs = options?.streamTtlMs ?? 10 * 60 * 1000; // 10 min
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getUpstreamUrl(): string {
    return this.upstreamUrl;
  }

  getCatalogs(): StremioCatalog[] {
    if (!this.enabled) return [];
    return [
      { type: "movie", id: "populares_fenix", name: "Populares (Fenix)" },
      { type: "movie", id: "recentes_servidor", name: "Recém Adicionado (Fenix)" },
      { type: "series", id: "populares_fenix", name: "Populares (Fenix)" },
      { type: "series", id: "recentes_servidor", name: "Recém Adicionado (Fenix)" },
    ];
  }

  async fetchCatalog(type: "movie" | "series", catalogId: string, extra?: string): Promise<StremioCatalogResponse> {
    if (!this.enabled) {
      return { metas: [] };
    }

    const cacheKey = `${type}:${catalogId}:${extra ?? ""}`;
    const cached = this.catalogCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    const url = `${this.upstreamUrl}/catalog/${type}/${encodeURIComponent(catalogId)}${extra ? `/${extra}` : ""}.json`;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Accept: "application/json",
        },
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));

      if (!response.ok) {
        console.warn(`[FenixFlix] Catalog error ${response.status} from ${url}`);
        return { metas: [] };
      }

      const body = (await response.json()) as StremioCatalogResponse;
      const result: StremioCatalogResponse = { metas: Array.isArray(body?.metas) ? body.metas : [] };

      this.catalogCache.set(cacheKey, {
        data: result,
        expiresAt: Date.now() + this.catalogTtlMs,
      });

      return result;
    } catch (error) {
      console.warn(`[FenixFlix] Failed to fetch catalog from ${url}:`, (error as Error).message);
      return { metas: [] };
    }
  }

  async fetchStreams(type: "movie" | "series", id: string): Promise<StremioStreamResponse> {
    if (!this.enabled) {
      return { streams: [] };
    }

    const cacheKey = `${type}:${id}`;
    const cached = this.streamCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    const url = `${this.upstreamUrl}/stream/${type}/${encodeURIComponent(id)}.json`;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Accept: "application/json",
        },
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));

      if (!response.ok) {
        console.warn(`[FenixFlix] Stream error ${response.status} from ${url}`);
        return { streams: [] };
      }

      const body = (await response.json()) as StremioStreamResponse;
      const result: StremioStreamResponse = { streams: Array.isArray(body?.streams) ? body.streams : [] };

      this.streamCache.set(cacheKey, {
        data: result,
        expiresAt: Date.now() + this.streamTtlMs,
      });

      return result;
    } catch (error) {
      console.warn(`[FenixFlix] Failed to fetch streams from ${url}:`, (error as Error).message);
      return { streams: [] };
    }
  }

  clearCache(): void {
    this.catalogCache.clear();
    this.streamCache.clear();
  }
}

let defaultFenixFlixClient: FenixFlixClient | undefined;

export function getDefaultFenixFlixClient(): FenixFlixClient {
  if (!defaultFenixFlixClient) {
    defaultFenixFlixClient = new FenixFlixClient();
  }
  return defaultFenixFlixClient;
}
