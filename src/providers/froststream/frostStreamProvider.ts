import type { DataClient } from "../../types/dataClient.js";
import type { StreamProvider, StreamQuery } from "../../types/streamProvider.js";
import type { StreamResult } from "../../types/streamResult.js";
import { FrostStreamClient } from "./frostStreamClient.js";
import type { FrostStreamRawResponse, FrostStreamRequest } from "./frostStreamTypes.js";

export interface FrostStreamProviderOptions {
  readonly client: DataClient<FrostStreamRequest, FrostStreamRawResponse>;
}

export class FrostStreamProvider implements StreamProvider {
  readonly id = "froststream";
  readonly name = "FrostStream ⚡";
  private readonly client: DataClient<FrostStreamRequest, FrostStreamRawResponse>;

  constructor(options: FrostStreamProviderOptions) {
    this.client = options.client;
  }

  async getStreams(query: StreamQuery, signal: AbortSignal): Promise<StreamResult[]> {
    if (query.type !== "movie" && query.type !== "series") {
      return [];
    }

    const raw = await this.client.fetch({ type: query.type, id: query.id }, signal);
    const streams: StreamResult[] = [];

    for (const item of raw.streams ?? []) {
      if (!item.url && !item.externalUrl) continue;

      const providerLabel = item.name ? `FrostStream (${item.name})` : this.name;
      streams.push({
        name: providerLabel,
        title: item.title || "Stream PT-BR",
        url: item.url || item.externalUrl || "",
      });
    }

    return streams;
  }
}
