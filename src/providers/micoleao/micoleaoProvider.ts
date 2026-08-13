import type { DataClient } from "../../types/dataClient.js";
import type { Parser } from "../../types/parser.js";
import type { StreamProvider, StreamQuery } from "../../types/streamProvider.js";
import type { StreamResult } from "../../types/streamResult.js";
import type { TorrentCandidateFile, TorrentCandidateResolver } from "../torrentIndexer/torrentCandidateResolver.js";
import { MicoLeaoParser } from "./micoleaoParser.js";
import type { MicoLeaoRawResponse, MicoLeaoRequest, MicoLeaoResponse } from "./micoleaoTypes.js";

export interface MicoLeaoProviderOptions {
  readonly client: DataClient<MicoLeaoRequest, MicoLeaoRawResponse>;
  readonly parser?: Parser<MicoLeaoRawResponse, MicoLeaoResponse>;
  readonly resolver?: TorrentCandidateResolver;
}

export class MicoLeaoProvider implements StreamProvider {
  readonly id = "micoleao";
  readonly name = "Mico Leão Dublado";
  private readonly client: DataClient<MicoLeaoRequest, MicoLeaoRawResponse>;
  private readonly parser: Parser<MicoLeaoRawResponse, MicoLeaoResponse>;
  private readonly resolver?: TorrentCandidateResolver;

  constructor(options: MicoLeaoProviderOptions) {
    this.client = options.client;
    this.parser = options.parser ?? new MicoLeaoParser();
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

      let infoHash = item.infoHash;
      if (!infoHash && item.magnet) {
        const match = /btih:([a-fA-F0-9]{40})/i.exec(item.magnet);
        if (match) {
          infoHash = match[1]?.toLowerCase();
        }
      }

      let playbackUrl = item.magnet ?? (infoHash ? `magnet:?xt=urn:btih:${infoHash}` : undefined);

      if (this.resolver && infoHash) {
        const files: TorrentCandidateFile[] = (item.files ?? []).map((file) => ({
          path: file.path,
        }));

        try {
          const resolved = await this.resolver.resolve({
            infoHash,
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
          console.error(`[micoleao] Debrid resolver failed: ${msg}`);
        }
      }

      if (!playbackUrl) continue;

      const details = [
        item.size ? `💾 ${item.size}` : undefined,
        item.audio && item.audio.length > 0 ? `🔊 ${item.audio.join(", ")}` : undefined,
        item.peers?.seeders !== undefined ? `👥 S: ${item.peers.seeders}` : undefined,
      ]
        .filter(Boolean)
        .join(" | ");

      const providerLabel = this.resolver && playbackUrl.startsWith("http")
        ? `${this.name} (Debrid)`
        : this.name;

      streams.push({
        name: providerLabel,
        title: `${item.title}${details ? `\n${details}` : ""}`,
        url: playbackUrl,
      });
    }

    return streams;
  }
}
