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

  getCatalogs(activeCatalogIds?: string[]): StremioCatalog[] {
    if (!this.enabled) return [];
    const allCatalogs: { idKey: string; catalog: StremioCatalog }[] = [
      { idKey: "populares_movie", catalog: { type: "movie", id: "populares_fenix", name: "Populares (Fenix)" } },
      { idKey: "recentes_movie", catalog: { type: "movie", id: "recentes_servidor", name: "Recém Adicionado (Fenix)" } },
      { idKey: "populares_series", catalog: { type: "series", id: "populares_fenix", name: "Populares (Fenix)" } },
      { idKey: "recentes_series", catalog: { type: "series", id: "recentes_servidor", name: "Recém Adicionado (Fenix)" } },
    ];

    if (!activeCatalogIds || activeCatalogIds.length === 0) {
      return allCatalogs.map((c) => c.catalog);
    }

    return allCatalogs
      .filter((c) => activeCatalogIds.includes(c.idKey))
      .map((c) => c.catalog);
  }

  async fetchCatalog(
    type: "movie" | "series",
    catalogId: string,
    extra?: string,
    upstreamConfig?: string,
  ): Promise<StremioCatalogResponse> {
    if (!this.enabled) {
      return { metas: [] };
    }

    const cacheKey = `${upstreamConfig ?? ""}:${type}:${catalogId}:${extra ?? ""}`;
    const cached = this.catalogCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    const configPath = upstreamConfig ? `/${encodeURIComponent(upstreamConfig)}` : "";
    const url = `${this.upstreamUrl}${configPath}/catalog/${type}/${encodeURIComponent(catalogId)}${extra ? `/${extra}` : ""}.json`;

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

  async fetchStreams(
    type: "movie" | "series",
    id: string,
    upstreamConfig?: string,
  ): Promise<StremioStreamResponse> {
    if (!this.enabled) {
      return { streams: [] };
    }

    const cacheKey = `${upstreamConfig ?? ""}:${type}:${id}`;
    const cached = this.streamCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    const configPath = upstreamConfig ? `/${encodeURIComponent(upstreamConfig)}` : "";
    const url = `${this.upstreamUrl}${configPath}/stream/${type}/${encodeURIComponent(id)}.json`;

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
