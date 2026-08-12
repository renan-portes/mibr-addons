import type { DataClient } from "../../types/dataClient.js";
import type { Parser } from "../../types/parser.js";
import type { StreamProvider, StreamQuery } from "../../types/streamProvider.js";
import type { StreamResult } from "../../types/streamResult.js";
import { BluDVParser } from "./bludvParser.js";
import type { BluDVRawResponse, BluDVRequest, BluDVResponse } from "./bludvTypes.js";

export interface BluDVProviderOptions {
  readonly client: DataClient<BluDVRequest, BluDVRawResponse>;
  readonly parser?: Parser<BluDVRawResponse, BluDVResponse>;
}

export class BluDVProvider implements StreamProvider {
  readonly id = "bludv";
  readonly name = "BluDV Provider";
  private readonly client: DataClient<BluDVRequest, BluDVRawResponse>;
  private readonly parser: Parser<BluDVRawResponse, BluDVResponse>;

  constructor(options: BluDVProviderOptions) {
    this.client = options.client;
    this.parser = options.parser ?? new BluDVParser();
  }

  async getStreams(query: StreamQuery, signal: AbortSignal): Promise<StreamResult[]> {
    if (query.type !== "movie" && query.type !== "series") {
      return [];
    }

    const imdbId = query.id.split(":")[0];
    if (!imdbId || !/^tt\d+$/.test(imdbId)) {
      return [];
    }

    const rawData = await this.client.fetch({ imdb: imdbId }, signal);
    const parsed = this.parser.parse(rawData);

    const streams: StreamResult[] = [];
    for (const item of parsed.items) {
      if (item.imdb && item.imdb !== imdbId) {
        continue;
      }

      const infoHash = item.infoHash;
      const url = item.magnet ?? (infoHash ? `magnet:?xt=urn:btih:${infoHash}` : undefined);
      if (!url) continue;

      const details = [
        item.size ? `💾 ${item.size}` : undefined,
        item.audio && item.audio.length > 0 ? `🔊 ${item.audio.join(", ")}` : undefined,
        item.peers?.seeders !== undefined ? `👥 S: ${item.peers.seeders}` : undefined,
      ]
        .filter(Boolean)
        .join(" | ");

      streams.push({
        name: this.name,
        title: `${item.title}${details ? `\n${details}` : ""}`,
        url,
      });
    }

    return streams;
  }
}
