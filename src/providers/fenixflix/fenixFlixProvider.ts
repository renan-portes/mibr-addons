import type { DataClient } from "../../types/dataClient.js";
import type { StreamProvider, StreamQuery } from "../../types/streamProvider.js";
import type { StreamResult } from "../../types/streamResult.js";
import type { FenixFlixRawResponse, FenixFlixRequest } from "./fenixFlixTypes.js";

export interface FenixFlixProviderOptions {
  readonly client: DataClient<FenixFlixRequest, FenixFlixRawResponse>;
}

export class FenixFlixProvider implements StreamProvider {
  readonly id = "fenixflix";
  readonly name = "FenixFlix 🐦‍🔥";
  private readonly client: DataClient<FenixFlixRequest, FenixFlixRawResponse>;

  constructor(options: FenixFlixProviderOptions) {
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

      const title = item.title && item.title !== "undefined" ? item.title : "FenixFlix PT-BR Stream";
      const name = item.name ? `FenixFlix (${item.name})` : this.name;

      streams.push({
        name,
        title,
        url: item.url,
      });
    }

    return streams;
  }
}
