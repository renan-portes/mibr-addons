import type { DataClient } from "../../types/dataClient.js";
import type { StreamProvider, StreamQuery } from "../../types/streamProvider.js";
import type { StreamResult } from "../../types/streamResult.js";
import type { CometRawResponse, CometRequest } from "./cometTypes.js";

export interface CometProviderOptions {
  readonly client: DataClient<CometRequest, CometRawResponse>;
}

export class CometProvider implements StreamProvider {
  readonly id = "comet";
  readonly name = "Comet ☄️";
  private readonly client: DataClient<CometRequest, CometRawResponse>;

  constructor(options: CometProviderOptions) {
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
        name: item.name ? `Comet (${item.name})` : this.name,
        title: item.title || "Comet Torrent",
        url: item.url,
        infoHash: item.infoHash,
      });
    }

    return streams;
  }
}
