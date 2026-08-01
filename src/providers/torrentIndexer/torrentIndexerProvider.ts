import type { DataClient } from "../../types/dataClient.js";
import type { Parser } from "../../types/parser.js";
import type { StreamProvider, StreamQuery } from "../../types/streamProvider.js";
import type { StreamResult } from "../../types/streamResult.js";
import type {
  TorrentIndexerRawResponse,
  TorrentIndexerRequest,
  TorrentIndexerResponse,
  TorrentIndexerSource,
} from "./torrentIndexerTypes.js";

const IMDB_BASE_PATTERN = /^(tt\d{7,10})(?::.*)?$/;

export class TorrentIndexerProvider implements StreamProvider {
  readonly id = "torrent-indexer";
  readonly name = "Torrent Indexer (experimental)";

  constructor(
    private readonly client: DataClient<TorrentIndexerRequest, TorrentIndexerRawResponse>,
    private readonly parser: Parser<TorrentIndexerRawResponse, TorrentIndexerResponse>,
    readonly source: TorrentIndexerSource,
  ) {}

  async getStreams(query: StreamQuery, signal: AbortSignal): Promise<StreamResult[]> {
    const imdb = IMDB_BASE_PATTERN.exec(query.id)?.[1];
    if (imdb === undefined) return [];

    const payload = await this.client.fetch(
      {
        q: query.id,
        imdb,
        filterResults: true,
      },
      signal,
    );
    const response = this.parser.parse(payload);

    const hasMatchingDiscovery = response.items.some((item) => item.imdb === imdb);

    if (!hasMatchingDiscovery) return [];

    // The researched API exposes discovery metadata and magnets, but no explicit
    // HTTP/HTTPS playback URL. Never expose a magnet as StreamResult.url.
    return [];
  }
}
