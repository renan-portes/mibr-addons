import type { DataClient } from "../../types/dataClient.js";
import type { StreamProvider, StreamQuery } from "../../types/streamProvider.js";
import type { StreamResult } from "../../types/streamResult.js";
import type { StremThruRawResponse, StremThruRequest } from "./stremThruTypes.js";

export interface StremThruProviderOptions {
  readonly client: DataClient<StremThruRequest, StremThruRawResponse>;
}

export class StremThruProvider implements StreamProvider {
  readonly id = "stremthru";
  readonly name = "StremThru Torz ⚡";
  private readonly client: DataClient<StremThruRequest, StremThruRawResponse>;

  constructor(options: StremThruProviderOptions) {
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
        name: item.name ? `StremThru (${item.name})` : this.name,
        title: item.title || "StremThru Stream",
        url: item.url,
        infoHash: item.infoHash,
      });
    }

    return streams;
  }
}
