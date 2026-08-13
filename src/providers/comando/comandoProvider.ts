import type { DataClient } from "../../types/dataClient.js";
import type { Parser } from "../../types/parser.js";
import type { StreamProvider, StreamQuery } from "../../types/streamProvider.js";
import type { StreamResult } from "../../types/streamResult.js";
import type { TorrentCandidateFile, TorrentCandidateResolver } from "../torrentIndexer/torrentCandidateResolver.js";
import { ComandoParser } from "./comandoParser.js";
import type { ComandoRawResponse, ComandoRequest, ComandoResponse } from "./comandoTypes.js";

export interface ComandoProviderOptions {
  readonly client: DataClient<ComandoRequest, ComandoRawResponse>;
  readonly parser?: Parser<ComandoRawResponse, ComandoResponse>;
  readonly resolver?: TorrentCandidateResolver;
}

export class ComandoProvider implements StreamProvider {
  readonly id = "comando";
  readonly name = "Comando Torrents";
  private readonly client: DataClient<ComandoRequest, ComandoRawResponse>;
  private readonly parser: Parser<ComandoRawResponse, ComandoResponse>;
  private readonly resolver?: TorrentCandidateResolver;

  constructor(options: ComandoProviderOptions) {
    this.client = options.client;
    this.parser = options.parser ?? new ComandoParser();
    this.resolver = options.resolver;
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

      let playbackUrl: string | undefined;

      if (this.resolver && item.infoHash) {
        const files: TorrentCandidateFile[] = item.files.map((file) => ({
          path: file.path,
        }));

        try {
          const resolved = await this.resolver.resolve({
            infoHash: item.infoHash,
            magnet: item.magnet,
            files,
            media: { id: query.id, type: query.type },
            signal,
          });

          if (resolved?.url) {
            playbackUrl = resolved.url;
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[comando] Real-Debrid resolver failed: ${msg}`);
        }
      }

      if (!playbackUrl) {
        continue;
      }

      const titleParts: string[] = [item.title];
      if (item.audio.length > 0) {
        titleParts.push(`🔊 ${item.audio.join(", ")}`);
      }
      if (item.size) {
        titleParts.push(`💾 ${item.size}`);
      }

      streams.push({
        name: "Comando (RD)",
        title: titleParts.join(" • "),
        url: playbackUrl,
      });
    }

    return streams;
  }
}
