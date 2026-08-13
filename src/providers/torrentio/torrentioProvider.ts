import type { StreamProvider, StreamQuery } from "../../types/streamProvider.js";
import type { StreamResult } from "../../types/streamResult.js";
import type { TorrentCandidateFile, TorrentCandidateResolver } from "../torrentIndexer/torrentCandidateResolver.js";
import type { TorrentioClient } from "./torrentioClient.js";
import type { TorrentioParser } from "./torrentioParser.js";

export interface TorrentioProviderOptions {
  readonly client: TorrentioClient;
  readonly parser: TorrentioParser;
  readonly resolver?: TorrentCandidateResolver;
}

export class TorrentioProvider implements StreamProvider {
  readonly id = "torrentio";
  readonly name = "Torrentio";
  private readonly client: TorrentioClient;
  private readonly parser: TorrentioParser;
  private readonly resolver?: TorrentCandidateResolver;

  constructor(options: TorrentioProviderOptions) {
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

    const raw = await this.client.fetch({ type: query.type, id: query.id }, signal);
    const parsed = this.parser.parse(raw);

    const results: StreamResult[] = [];

    for (const item of parsed.streams) {
      let playbackUrl = item.url;
      const infoHash = item.infoHash;

      if (!playbackUrl && this.resolver && infoHash) {
        const files: TorrentCandidateFile[] = item.behaviorHints?.filename
          ? [{ path: item.behaviorHints.filename }]
          : [];

        try {
          const resolved = await this.resolver.resolve({
            infoHash,
            magnet: `magnet:?xt=urn:btih:${infoHash}`,
            files,
            media: { id: query.id, type: query.type },
            signal,
          });

          if (resolved?.url) {
            playbackUrl = resolved.url;
          }
        } catch {
          // Failure isolation: keep fallback if resolver fails
        }
      }

      if (item.isMock && (!playbackUrl || playbackUrl.startsWith("magnet:"))) {
        playbackUrl = "https://vjs.zencdn.net/v/oceans.mp4";
      }

      if (!playbackUrl) continue;

      const providerLabel = this.resolver ? "Torrentio (Real-Debrid)" : "Torrentio";
      const name = item.name ? `${providerLabel}\n${item.name}` : providerLabel;
      const title = item.title || `Torrentio Stream (${query.id})`;

      results.push({
        name,
        title,
        url: playbackUrl,
        ...(item.behaviorHints ? { behaviorHints: item.behaviorHints } : {}),
      });
    }

    return results;
  }
}
