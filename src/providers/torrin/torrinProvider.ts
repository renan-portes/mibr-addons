import type { DataClient } from "../../types/dataClient.js";
import type { StreamProvider, StreamQuery } from "../../types/streamProvider.js";
import type { StreamResult } from "../../types/streamResult.js";
import type { TorrinRawResponse, TorrinRequest } from "./torrinTypes.js";

export interface TorrinProviderOptions {
  readonly client: DataClient<TorrinRequest, TorrinRawResponse>;
}

export class TorrinProvider implements StreamProvider {
  readonly id = "torrin";
  readonly name = "Torrin ⚡";
  private readonly client: DataClient<TorrinRequest, TorrinRawResponse>;

  constructor(options: TorrinProviderOptions) {
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
        name: item.name ? `Torrin (${item.name})` : this.name,
        title: item.title || "Torrin Stream",
        url: item.url,
        infoHash: item.infoHash,
      });
    }

    return streams;
  }
}
