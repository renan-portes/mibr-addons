import type { HttpDataClient } from "../../clients/http/httpDataClient.js";
import type {
  FrostViewCatalogResponse,
  FrostViewMetaResponse,
  FrostViewRawResponse,
  FrostViewRequest,
} from "./frostViewTypes.js";

export interface FrostViewClientOptions {
  readonly baseUrl?: string | URL;
}

export class FrostViewClient {
  private readonly httpClient: HttpDataClient;
  private readonly baseUrl: string;

  constructor(httpClient: HttpDataClient, options?: FrostViewClientOptions) {
    this.httpClient = httpClient;
    const rawUrl = options?.baseUrl ? String(options.baseUrl) : "https://frostviewb.cloutteam.com";
    this.baseUrl = rawUrl.replace(/\/$/, "");
  }

  async fetchStreams(request: FrostViewRequest, signal: AbortSignal): Promise<FrostViewRawResponse> {
    const endpoint = `${this.baseUrl}/stream/channel/${encodeURIComponent(request.id)}.json`;
    try {
      const data = await this.httpClient.getJson(endpoint, { signal });
      return (data as FrostViewRawResponse) ?? { streams: [] };
    } catch {
      return { streams: [] };
    }
  }

  async fetchCatalog(
    genre?: string,
    search?: string,
    skip?: number,
    signal?: AbortSignal,
  ): Promise<FrostViewCatalogResponse> {
    let path = `${this.baseUrl}/catalog/channel/froststream-channels`;
    const queryParams: string[] = [];
    if (genre) queryParams.push(`genre=${encodeURIComponent(genre)}`);
    if (search) queryParams.push(`search=${encodeURIComponent(search)}`);
    if (skip) queryParams.push(`skip=${skip}`);

    if (queryParams.length > 0) {
      path += `/${queryParams.join("&")}`;
    }
    path += ".json";

    try {
      const data = await this.httpClient.getJson(path, { signal });
      return (data as FrostViewCatalogResponse) ?? { metas: [] };
    } catch {
      return { metas: [] };
    }
  }

  async fetchMeta(id: string, signal?: AbortSignal): Promise<FrostViewMetaResponse> {
    const endpoint = `${this.baseUrl}/meta/channel/${encodeURIComponent(id)}.json`;
    try {
      const data = await this.httpClient.getJson(endpoint, { signal });
      return (data as FrostViewMetaResponse) ?? {};
    } catch {
      return {};
    }
  }
}
