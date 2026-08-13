import type { HttpDataClient } from "../../clients/http/httpDataClient.js";
import type { DataClient } from "../../types/dataClient.js";
import { TorrentIndexerDataClient } from "../torrentIndexer/torrentIndexerDataClient.js";
import type { MicoLeaoRawResponse, MicoLeaoRequest } from "./micoleaoTypes.js";

export interface MicoLeaoClientOptions {
  readonly baseUrl: string | URL;
  readonly indexerName?: string;
}

export class MicoLeaoClient implements DataClient<MicoLeaoRequest, MicoLeaoRawResponse> {
  private readonly client: TorrentIndexerDataClient;

  constructor(httpClient: HttpDataClient, options: MicoLeaoClientOptions) {
    this.client = new TorrentIndexerDataClient(httpClient, {
      baseUrl: options.baseUrl,
      indexer: options.indexerName ?? "micoleao",
      allowedIndexers: ["micoleao"],
    });
  }

  async fetch(request: MicoLeaoRequest, signal: AbortSignal): Promise<MicoLeaoRawResponse> {
    return this.client.fetch(request, signal);
  }
}
