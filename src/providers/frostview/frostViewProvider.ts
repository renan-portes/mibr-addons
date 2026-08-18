import type { StreamProvider, StreamQuery } from "../../types/streamProvider.js";
import type { StreamResult } from "../../types/streamResult.js";
import type { FrostViewClient } from "./frostViewClient.js";

export interface FrostViewProviderOptions {
  readonly client: FrostViewClient;
}

export class FrostViewProvider implements StreamProvider {
  readonly id = "frostview";
  readonly name = "FrostView TV 📺";
  readonly client: FrostViewClient;

  constructor(options: FrostViewProviderOptions) {
    this.client = options.client;
  }

  async getStreams(query: StreamQuery, signal: AbortSignal): Promise<StreamResult[]> {
    if (query.type !== "channel" && !query.id.startsWith("cs:channel:")) {
      return [];
    }

    const raw = await this.client.fetchStreams({ type: "channel", id: query.id }, signal);
    const streams: StreamResult[] = [];

    for (const item of raw.streams ?? []) {
      if (!item.url) continue;

      streams.push({
        name: item.name ? `FrostView TV (${item.name})` : this.name,
        title: item.title || "Transmissão Ao Vivo • PT-BR",
        url: item.url,
      });
    }

    return streams;
  }
}
