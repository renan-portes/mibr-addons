import type { HttpDataClient } from "../../clients/http/httpDataClient.js";
import type { DataClient } from "../../types/dataClient.js";
import type { BrazucaRawResponse, BrazucaRequest } from "./brazucaTypes.js";

export interface BrazucaClientOptions {
  readonly baseUrl?: string | URL;
}

export class BrazucaClient implements DataClient<BrazucaRequest, BrazucaRawResponse> {
  private readonly httpClient: HttpDataClient;
  private readonly baseUrl: string;

  constructor(httpClient: HttpDataClient, options?: BrazucaClientOptions) {
    this.httpClient = httpClient;
    const rawUrl = options?.baseUrl ? String(options.baseUrl) : "https://94c8cb9f702d-brazuca-torrents.baby-beamup.club";
    this.baseUrl = rawUrl.replace(/\/$/, "");
  }

  async fetch(request: BrazucaRequest, signal: AbortSignal): Promise<BrazucaRawResponse> {
    const endpoint = `${this.baseUrl}/stream/${request.type}/${encodeURIComponent(request.id)}.json`;
    try {
      const data = await this.httpClient.getJson(endpoint, { signal });
      return (data as BrazucaRawResponse) ?? { streams: [] };
    } catch {
      return { streams: [] };
    }
  }
}
