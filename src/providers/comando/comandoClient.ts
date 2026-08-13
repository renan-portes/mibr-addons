import type { HttpDataClient } from "../../clients/http/httpDataClient.js";
import type { DataClient } from "../../types/dataClient.js";
import { TorrentIndexerDataClient } from "../torrentIndexer/torrentIndexerDataClient.js";
import type { ComandoRawResponse, ComandoRequest } from "./comandoTypes.js";

export interface ComandoClientOptions {
  readonly baseUrl: string | URL;
  readonly indexerName?: string;
}

export class ComandoClient implements DataClient<ComandoRequest, ComandoRawResponse> {
  private readonly client: TorrentIndexerDataClient;

  constructor(httpClient: HttpDataClient, options: ComandoClientOptions) {
    this.client = new TorrentIndexerDataClient(httpClient, {
      baseUrl: options.baseUrl,
      indexer: options.indexerName ?? "comando",
      allowedIndexers: ["comando"],
    });
  }

  async fetch(request: ComandoRequest, signal: AbortSignal): Promise<ComandoRawResponse> {
    return this.client.fetch(request, signal);
  }
}
