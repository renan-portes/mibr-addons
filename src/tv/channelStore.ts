import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseM3U } from "./m3uParser.js";
import type { TvChannel, TvCatalogFilter } from "./types.js";

// Fallback channels (free public Brazilian broadcast streams) used only if no local M3U is provided
const DEFAULT_FALLBACK_M3U = `
#EXTM3U
#EXTINF:-1 tvg-id="tvbrasil" tvg-name="TV Brasil" tvg-logo="https://upload.wikimedia.org/wikipedia/commons/thumb/c/cf/TV_Brasil_logo_2023.svg/512px-TV_Brasil_logo_2023.svg.png" group-title="Abertos",TV Brasil HD
https://tvbrasil-stream.ebc.com.br/hls/tvbrasil/index.m3u8
#EXTINF:-1 tvg-id="tvcultura" tvg-name="TV Cultura" tvg-logo="https://upload.wikimedia.org/wikipedia/commons/thumb/3/3b/TV_Cultura_logo.svg/512px-TV_Cultura_logo.svg.png" group-title="Abertos",TV Cultura HD
https://cultura-stream.fundacaopadreanchieta.org.br/hls/cultura/index.m3u8
#EXTINF:-1 tvg-id="canalgov" tvg-name="Canal Gov" tvg-logo="https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Canal_Gov_logo.png/512px-Canal_Gov_logo.png" group-title="Abertos",Canal Gov HD
https://canalgov-stream.ebc.com.br/hls/canalgov/index.m3u8
#EXTINF:-1 tvg-id="recordnews" tvg-name="Record News" tvg-logo="https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Record_News_logo_2023.svg/512px-Record_News_logo_2023.svg.png" group-title="Notícias",Record News HD
https://stream.recordnews.com.br/hls/live.m3u8
`.trim();

export interface ChannelStoreOptions {
  readonly m3uPath?: string;
  readonly m3uUrl?: string;
  readonly initialContent?: string;
}

export class ChannelStore {
  private channels: TvChannel[] = [];
  private channelsById: Map<string, TvChannel> = new Map();
  private readonly m3uPath?: string;
  private readonly m3uUrl?: string;

  constructor(options?: ChannelStoreOptions) {
    this.m3uPath = options?.m3uPath ?? process.env.CHANNELS_M3U_PATH ?? "./data/channels.m3u";
    this.m3uUrl = options?.m3uUrl ?? process.env.CHANNELS_M3U_URL;

    if (options?.initialContent) {
      this.loadFromContent(options.initialContent);
    } else {
      this.reloadSync();
    }
  }

  loadFromContent(content: string): void {
    const parsed = parseM3U(content);
    this.setChannels(parsed);
  }

  reloadSync(): void {
    if (this.m3uPath) {
      const resolvedPath = resolve(process.cwd(), this.m3uPath);
      if (existsSync(resolvedPath)) {
        try {
          const content = readFileSync(resolvedPath, "utf8");
          const parsed = parseM3U(content);
          if (parsed.length > 0) {
            this.setChannels(parsed);
            return;
          }
        } catch (error) {
          console.error(`[ChannelStore] Error reading M3U file at ${resolvedPath}:`, error);
        }
      }
    }

    // If local file not found or empty, load fallback
    this.loadFromContent(DEFAULT_FALLBACK_M3U);
  }

  async reload(): Promise<void> {
    if (this.m3uUrl) {
      try {
        const response = await fetch(this.m3uUrl, {
          headers: { "User-Agent": "MIBR-TV/1.0" },
        });
        if (response.ok) {
          const content = await response.text();
          const parsed = parseM3U(content);
          if (parsed.length > 0) {
            this.setChannels(parsed);
            return;
          }
        }
      } catch (error) {
        console.error(`[ChannelStore] Error fetching remote M3U at ${this.m3uUrl}:`, error);
      }
    }

    this.reloadSync();
  }

  private setChannels(channels: TvChannel[]): void {
    this.channels = channels;
    this.channelsById.clear();
    for (const ch of channels) {
      this.channelsById.set(ch.id, ch);
    }
  }

  getChannels(filter?: TvCatalogFilter): TvChannel[] {
    let result = this.channels;

    if (filter?.genre) {
      const targetGenre = filter.genre.toLowerCase();
      result = result.filter((ch) => ch.group.toLowerCase() === targetGenre);
    }

    if (filter?.search) {
      const query = filter.search.toLowerCase();
      result = result.filter((ch) => ch.name.toLowerCase().includes(query));
    }

    const skip = filter?.skip ?? 0;
    const limit = filter?.limit ?? 100;

    return result.slice(skip, skip + limit);
  }

  getChannelById(id: string): TvChannel | undefined {
    return this.channelsById.get(id);
  }

  getGenres(): string[] {
    const genres = new Set<string>();
    for (const ch of this.channels) {
      if (ch.group) {
        genres.add(ch.group);
      }
    }
    return Array.from(genres).sort();
  }

  getStats(): { totalChannels: number; genres: Record<string, number> } {
    const genreCounts: Record<string, number> = {};
    for (const ch of this.channels) {
      genreCounts[ch.group] = (genreCounts[ch.group] ?? 0) + 1;
    }

    return {
      totalChannels: this.channels.length,
      genres: genreCounts,
    };
  }
}

let defaultStoreInstance: ChannelStore | undefined;

export function getDefaultChannelStore(): ChannelStore {
  if (!defaultStoreInstance) {
    defaultStoreInstance = new ChannelStore();
  }
  return defaultStoreInstance;
}
