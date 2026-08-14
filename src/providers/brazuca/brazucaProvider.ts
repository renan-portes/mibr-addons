import type { DataClient } from "../../types/dataClient.js";
import type { StreamProvider, StreamQuery } from "../../types/streamProvider.js";
import type { StreamResult } from "../../types/streamResult.js";
import type { BrazucaRawResponse, BrazucaRequest } from "./brazucaTypes.js";

export interface BrazucaProviderOptions {
  readonly client: DataClient<BrazucaRequest, BrazucaRawResponse>;
}

export class BrazucaProvider implements StreamProvider {
  readonly id = "brazuca";
  readonly name = "Brazuca Torrents 🇧🇷";
  private readonly client: DataClient<BrazucaRequest, BrazucaRawResponse>;

  constructor(options: BrazucaProviderOptions) {
    this.client = options.client;
  }

  async getStreams(query: StreamQuery, signal: AbortSignal): Promise<StreamResult[]> {
    if (query.type !== "movie" && query.type !== "series") {
      return [];
    }

    const raw = await this.client.fetch({ type: query.type, id: query.id }, signal);
    const streams: StreamResult[] = [];

    for (const item of raw.streams ?? []) {
      if (!item.url && !item.infoHash) continue;

      streams.push({
        name: item.name ? `Brazuca (${item.name})` : this.name,
        title: item.title || "Brazuca Torrent",
        url: item.url,
        infoHash: item.infoHash,
      });
    }

    return streams;
  }
}
