import type { StreamProvider, StreamQuery } from "../../types/streamProvider.js";
import type { StreamResult } from "../../types/streamResult.js";
import type { TorrentCandidateFile, TorrentCandidateResolver } from "../torrentIndexer/torrentCandidateResolver.js";
import type { TorrentDosFilmesClient } from "./torrentDosFilmesClient.js";
import type { TorrentDosFilmesParser } from "./torrentDosFilmesParser.js";

export interface TorrentDosFilmesProviderOptions {
  readonly client: TorrentDosFilmesClient;
  readonly parser: TorrentDosFilmesParser;
  readonly resolver?: TorrentCandidateResolver;
}

export class TorrentDosFilmesProvider implements StreamProvider {
  readonly id = "torrentdosfilmes";
  readonly name = "Torrent dos Filmes (PT-BR)";
  private readonly client: TorrentDosFilmesClient;
  private readonly parser: TorrentDosFilmesParser;
  private readonly resolver?: TorrentCandidateResolver;

  constructor(options: TorrentDosFilmesProviderOptions) {
    this.client = options.client;
    this.parser = options.parser;
    this.resolver = options.resolver;
  }

  async getStreams(query: StreamQuery, signal: AbortSignal): Promise<StreamResult[]> {
    if (query.type !== "movie" && query.type !== "series") {
      return [];
    }

    if (!query.id || !query.id.startsWith("tt")) {
      return [];
    }

    const imdbId = query.id.split(":")[0];
    const raw = await this.client.fetch({ imdb: imdbId }, signal);
    const parsed = this.parser.parse(raw);

    const results: StreamResult[] = [];

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
        try {
          const resolved = await this.resolver.resolve({
            infoHash,
            magnet: item.magnet,
            files: [],
            media: { id: query.id, type: query.type },
            signal,
          });

          if (resolved?.url) {
            playbackUrl = resolved.url;
          }
        } catch {
          // Failure isolation: keep fallback magnet if resolver fails
        }
      }

      if (item.isMock && (!playbackUrl || playbackUrl.startsWith("magnet:"))) {
        playbackUrl = "https://vjs.zencdn.net/v/oceans.mp4";
      }

      if (!playbackUrl) continue;

      const providerLabel = this.resolver
        ? "Torrent dos Filmes (Real-Debrid PT-BR)"
        : "Torrent dos Filmes (PT-BR)";

      const details = [
        item.size ? `💾 ${item.size}` : undefined,
        item.audio && item.audio.length > 0 ? `🔊 ${item.audio.join(", ")}` : undefined,
        item.seeders !== undefined ? `👥 S: ${item.seeders}` : undefined,
      ].filter(Boolean);

      const title = `${item.title}${details.length > 0 ? `\n${details.join(" | ")}` : ""}`;

      results.push({
        name: providerLabel,
        title,
        url: playbackUrl,
      });
    }

    return results;
  }
}
