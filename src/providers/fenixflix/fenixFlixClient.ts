import type { HttpDataClient } from "../../clients/http/httpDataClient.js";
import type { DataClient } from "../../types/dataClient.js";
import type { FenixFlixRawResponse, FenixFlixRequest } from "./fenixFlixTypes.js";

export interface FenixFlixClientOptions {
  readonly baseUrl?: string | URL;
}

export class FenixFlixClient implements DataClient<FenixFlixRequest, FenixFlixRawResponse> {
  private readonly httpClient: HttpDataClient;
  private readonly baseUrl: string;

  constructor(httpClient: HttpDataClient, options?: FenixFlixClientOptions) {
    this.httpClient = httpClient;
    const rawUrl = options?.baseUrl ? String(options.baseUrl) : "https://fenixflix.fenixhub.online";
    this.baseUrl = rawUrl.replace(/\/$/, "");
  }

  async fetch(request: FenixFlixRequest, signal: AbortSignal): Promise<FenixFlixRawResponse> {
    const endpoint = `${this.baseUrl}/stream/${request.type}/${encodeURIComponent(request.id)}.json`;
    try {
      const data = await this.httpClient.getJson(endpoint, { signal });
      return (data as FenixFlixRawResponse) ?? { streams: [] };
    } catch {
      return { streams: [] };
    }
  }
}
