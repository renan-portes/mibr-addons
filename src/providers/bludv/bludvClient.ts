import type { HttpDataClient } from "../../clients/http/httpDataClient.js";
import type { DataClient } from "../../types/dataClient.js";
import type { BluDVRawResponse, BluDVRequest } from "./bludvTypes.js";

export interface BluDVClientOptions {
  readonly baseUrl: string | URL;
  readonly indexerName?: string;
}

function normalizeBaseUrl(value: string | URL): URL {
  const raw = value.toString().trim();
  if (raw === "mock" || raw === "http://mock" || raw === "https://mock") {
    return new URL("http://mock.invalid/");
  }

  const url = new URL(raw);

  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error("Invalid BluDV base URL");
  }

  url.pathname = `${url.pathname.replace(/\/+$/, "")}/`;
  return url;
}

export class BluDVClient implements DataClient<BluDVRequest, BluDVRawResponse> {
  readonly indexerName: string;
  private readonly baseUrl: URL;
  private readonly isMockMode: boolean;

  constructor(
    private readonly httpClient: HttpDataClient,
    options: BluDVClientOptions,
  ) {
    const raw = options.baseUrl.toString().trim().toLowerCase();
    this.isMockMode = raw === "mock" || raw === "http://mock" || raw === "https://mock" || raw === "http://mock.invalid/";
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.indexerName = options.indexerName?.trim() || "bludv";
  }

  async fetch(request: BluDVRequest, signal: AbortSignal): Promise<BluDVRawResponse> {
    if (this.isMockMode) {
      const imdbId = request.imdb || "tt0068646";
      return {
        results: [
          {
            title: "BluDV | O Poderoso Chefão (1972) 1080p Dual Áudio",
            imdb: imdbId,
            audio: ["Português", "Inglês"],
            magnet: "magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567&dn=Godfather",
            info_hash: "0123456789abcdef0123456789abcdef01234567",
            trackers: ["udp://tracker.opentrackr.org:1337/announce"],
            size: "2.5 GB",
            files: [{ path: "Godfather.1972.1080p.mkv", size: "2.5 GB" }],
            peers: { seeders: 150, leechers: 10 },
          },
        ],
        count: 1,
      };
    }

    const url = new URL(`indexers/${encodeURIComponent(this.indexerName)}`, this.baseUrl);

    if (request.imdb !== undefined) {
      url.searchParams.set("imdb", request.imdb);
    }
    if (request.q !== undefined) {
      url.searchParams.set("q", request.q);
    }
    if (request.limit !== undefined) {
      url.searchParams.set("limit", String(request.limit));
    }
    if (request.year !== undefined) {
      url.searchParams.set("year", request.year);
    }

    return this.httpClient.getJson(url, { signal });
  }
}
