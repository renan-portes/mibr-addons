import type { HttpDataClient } from "../../clients/http/httpDataClient.js";
import type { DataClient } from "../../types/dataClient.js";
import type { TorrinRawResponse, TorrinRequest } from "./torrinTypes.js";

export interface TorrinClientOptions {
  readonly baseUrl?: string | URL;
}

export class TorrinClient implements DataClient<TorrinRequest, TorrinRawResponse> {
  private readonly httpClient: HttpDataClient;
  private readonly baseUrl: string;

  constructor(httpClient: HttpDataClient, options?: TorrinClientOptions) {
    this.httpClient = httpClient;
    const rawUrl = options?.baseUrl ? String(options.baseUrl) : "https://addon.torrin.app";
    this.baseUrl = rawUrl.replace(/\/$/, "");
  }

  async fetch(request: TorrinRequest, signal: AbortSignal): Promise<TorrinRawResponse> {
    const endpoint = `${this.baseUrl}/stream/${request.type}/${encodeURIComponent(request.id)}.json`;
    try {
      const data = await this.httpClient.getJson(endpoint, { signal });
      return (data as TorrinRawResponse) ?? { streams: [] };
    } catch {
      return { streams: [] };
    }
  }
}
