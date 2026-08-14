import type { HttpDataClient } from "../../clients/http/httpDataClient.js";
import type { DataClient } from "../../types/dataClient.js";
import type { FrostStreamRawResponse, FrostStreamRequest } from "./frostStreamTypes.js";

export interface FrostStreamClientOptions {
  readonly baseUrl?: string | URL;
}

export class FrostStreamClient implements DataClient<FrostStreamRequest, FrostStreamRawResponse> {
  private readonly httpClient: HttpDataClient;
  private readonly baseUrl: string;

  constructor(httpClient: HttpDataClient, options?: FrostStreamClientOptions) {
    this.httpClient = httpClient;
    const rawUrl = options?.baseUrl ? String(options.baseUrl) : "https://froststream.cloutteam.com";
    this.baseUrl = rawUrl.replace(/\/$/, "");
  }

  async fetch(request: FrostStreamRequest, signal: AbortSignal): Promise<FrostStreamRawResponse> {
    const endpoint = `${this.baseUrl}/stream/${request.type}/${encodeURIComponent(request.id)}.json`;
    try {
      const data = await this.httpClient.getJson(endpoint, { signal });
      return (data as FrostStreamRawResponse) ?? { streams: [] };
    } catch {
      return { streams: [] };
    }
  }
}
