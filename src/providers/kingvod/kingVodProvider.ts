import type { DataClient } from "../../types/dataClient.js";
import type { StreamProvider, StreamQuery } from "../../types/streamProvider.js";
import type { StreamResult } from "../../types/streamResult.js";
import type { KingVodRawResponse, KingVodRequest } from "./kingVodTypes.js";

export interface KingVodProviderOptions {
  readonly client: DataClient<KingVodRequest, KingVodRawResponse>;
}

export class KingVodProvider implements StreamProvider {
  readonly id = "kingvod";
  readonly name = "King VOD 👑";
  private readonly client: DataClient<KingVodRequest, KingVodRawResponse>;

  constructor(options: KingVodProviderOptions) {
    this.client = options.client;
  }

  async getStreams(query: StreamQuery, signal: AbortSignal): Promise<StreamResult[]> {
    if (query.type !== "movie" && query.type !== "series") {
      return [];
    }

    const raw = await this.client.fetch({ type: query.type, id: query.id }, signal);
    const streams: StreamResult[] = [];

    for (const item of raw.streams ?? []) {
      if (!item.url) continue;

      streams.push({
        name: item.name ? `King VOD (${item.name})` : this.name,
        title: item.title || "Stream HLS • 🇧🇷 Dublado PT-BR",
        url: item.url,
      });
    }

    return streams;
  }
}
