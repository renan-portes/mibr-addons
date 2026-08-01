import type { HttpDataClient } from "../../clients/http/httpDataClient.js";
import type { DataClient } from "../../types/dataClient.js";
import type {
  TorrentIndexerName,
  TorrentIndexerRawResponse,
  TorrentIndexerRequest,
} from "./torrentIndexerTypes.js";

const INDEXER_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

export interface TorrentIndexerDataClientOptions {
  baseUrl: string | URL;
  indexer: TorrentIndexerName;
  allowedIndexers: readonly TorrentIndexerName[];
}

function normalizeIndexer(indexer: string): string {
  const normalized = indexer.trim();

  if (!INDEXER_PATTERN.test(normalized)) {
    throw new Error(`Invalid torrent indexer name: ${indexer}`);
  }

  return normalized;
}

function normalizeBaseUrl(value: string | URL): URL {
  const url = new URL(value.toString());

  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error("Invalid torrent indexer base URL");
  }

  url.pathname = `${url.pathname.replace(/\/+$/, "")}/`;
  return url;
}

function appendRequestParams(url: URL, request: TorrentIndexerRequest): void {
  if (request.q !== undefined) url.searchParams.set("q", request.q);
  if (request.filterResults !== undefined) {
    url.searchParams.set("filter_results", String(request.filterResults));
  }
  if (request.limit !== undefined) url.searchParams.set("limit", String(request.limit));
  if (request.sortBy !== undefined) url.searchParams.set("sortBy", request.sortBy);
  if (request.sortDirection !== undefined) {
    url.searchParams.set("sortDirection", request.sortDirection);
  }
  if (request.audio !== undefined) url.searchParams.set("audio", request.audio.join(","));
  if (request.year !== undefined) url.searchParams.set("year", request.year);
  if (request.imdb !== undefined) url.searchParams.set("imdb", request.imdb);
}

export class TorrentIndexerDataClient
  implements DataClient<TorrentIndexerRequest, TorrentIndexerRawResponse>
{
  readonly indexer: TorrentIndexerName;
  private readonly baseUrl: URL;

  constructor(
    private readonly httpClient: HttpDataClient,
    options: TorrentIndexerDataClientOptions,
  ) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.indexer = normalizeIndexer(options.indexer);
    const allowedIndexers = new Set(options.allowedIndexers.map(normalizeIndexer));

    if (!allowedIndexers.has(this.indexer)) {
      throw new Error(`Torrent indexer is not allowed: ${this.indexer}`);
    }
  }

  async fetch(
    request: TorrentIndexerRequest,
    signal: AbortSignal,
  ): Promise<TorrentIndexerRawResponse> {
    const url = new URL(`indexers/${encodeURIComponent(this.indexer)}`, this.baseUrl);
    appendRequestParams(url, request);
    return this.httpClient.getJson(url, { signal });
  }
}
