import type { HttpDataClient } from "../../clients/http/httpDataClient.js";
import type { DataClient } from "../../types/dataClient.js";
import type { StremThruRawResponse, StremThruRequest } from "./stremThruTypes.js";

export interface StremThruClientOptions {
  readonly baseUrl?: string | URL;
}

export class StremThruClient implements DataClient<StremThruRequest, StremThruRawResponse> {
  private readonly httpClient: HttpDataClient;
  private readonly baseUrl: string;

  constructor(httpClient: HttpDataClient, options?: StremThruClientOptions) {
    this.httpClient = httpClient;
    const rawUrl = options?.baseUrl ? String(options.baseUrl) : "https://stremthru.13377001.xyz/stremio/torz";
    this.baseUrl = rawUrl.replace(/\/$/, "");
  }

  async fetch(request: StremThruRequest, signal: AbortSignal): Promise<StremThruRawResponse> {
    const endpoint = `${this.baseUrl}/stream/${request.type}/${encodeURIComponent(request.id)}.json`;
    try {
      const data = await this.httpClient.getJson(endpoint, { signal });
      return (data as StremThruRawResponse) ?? { streams: [] };
    } catch {
      return { streams: [] };
    }
  }
}
