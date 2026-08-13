import type { HttpDataClient } from "../../clients/http/httpDataClient.js";
import type { DataClient } from "../../types/dataClient.js";
import type { StreamQuery } from "../../types/streamProvider.js";
import type { NovaStreamsRawResponse } from "./novaStreamsTypes.js";

const DEFAULT_BASE_URL = "https://nova-streamz.vercel.app";

export interface NovaStreamsClientOptions {
  baseUrl?: string;
}

export class NovaStreamsClient implements DataClient<StreamQuery, NovaStreamsRawResponse> {
  private readonly baseUrl: string;

  constructor(
    private readonly httpClient: HttpDataClient,
    options: NovaStreamsClientOptions = {},
  ) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  }

  async fetch(query: StreamQuery, signal: AbortSignal): Promise<NovaStreamsRawResponse> {
    const url = `${this.baseUrl}/stream/${encodeURIComponent(query.type)}/${encodeURIComponent(query.id)}.json`;
    return this.httpClient.getJson<NovaStreamsRawResponse>(url, { signal });
  }
}
