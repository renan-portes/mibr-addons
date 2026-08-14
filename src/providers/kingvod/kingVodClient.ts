import type { HttpDataClient } from "../../clients/http/httpDataClient.js";
import type { DataClient } from "../../types/dataClient.js";
import type { KingVodRawResponse, KingVodRequest } from "./kingVodTypes.js";

export interface KingVodClientOptions {
  readonly baseUrl?: string | URL;
}

export class KingVodClient implements DataClient<KingVodRequest, KingVodRawResponse> {
  private readonly httpClient: HttpDataClient;
  private readonly baseUrl: string;

  constructor(httpClient: HttpDataClient, options?: KingVodClientOptions) {
    this.httpClient = httpClient;
    const rawUrl = options?.baseUrl ? String(options.baseUrl) : "https://kingvod.wasmer.app/index.php";
    this.baseUrl = rawUrl.replace(/\/$/, "");
  }

  async fetch(request: KingVodRequest, signal: AbortSignal): Promise<KingVodRawResponse> {
    const endpoint = `${this.baseUrl}/stream/${request.type}/${encodeURIComponent(request.id)}.json`;
    try {
      const data = await this.httpClient.getJson(endpoint, { signal });
      return (data as KingVodRawResponse) ?? { streams: [] };
    } catch {
      return { streams: [] };
    }
  }
}
