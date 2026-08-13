import type { HttpDataClient } from "../../clients/http/httpDataClient.js";
import type { DataClient } from "../../types/dataClient.js";
import type { TorrentDosFilmesClientOptions, TorrentDosFilmesRawResponse, TorrentDosFilmesRequest } from "./torrentDosFilmesTypes.js";

const DEFAULT_BASE_URL = "https://torrentdosfilmes2.site";

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
    throw new Error("Invalid Torrent dos Filmes base URL");
  }

  url.pathname = `${url.pathname.replace(/\/+$/, "")}/`;
  return url;
}

export class TorrentDosFilmesClient implements DataClient<TorrentDosFilmesRequest, TorrentDosFilmesRawResponse> {
  private readonly baseUrl: URL;
  private readonly isMockMode: boolean;

  constructor(
    private readonly httpClient: HttpDataClient,
    options?: TorrentDosFilmesClientOptions,
  ) {
    const raw = (options?.baseUrl ?? DEFAULT_BASE_URL).toString().trim().toLowerCase();
    this.isMockMode = raw === "mock" || raw === "http://mock" || raw === "https://mock" || raw === "http://mock.invalid/";
    this.baseUrl = normalizeBaseUrl(options?.baseUrl ?? DEFAULT_BASE_URL);
  }

  async fetch(request: TorrentDosFilmesRequest, signal: AbortSignal): Promise<TorrentDosFilmesRawResponse> {
    if (this.isMockMode) {
      const imdbId = request.imdb || "tt1375666";
      return {
        results: [
          {
            title: "Torrent dos Filmes | A Origem 1080p Dual Áudio PT-BR",
            imdb: imdbId,
            audio: ["Português (Dublado)", "Inglês"],
            quality: "1080p",
            magnet: "magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567&dn=Inception.PTBR",
            info_hash: "0123456789abcdef0123456789abcdef01234567",
            size: "2.8 GB",
            seeders: 320,
            isMock: true,
          },
        ],
        count: 1,
      };
    }

    const url = new URL("indexers/torrentdosfilmes", this.baseUrl);
    if (request.imdb !== undefined) {
      url.searchParams.set("imdb", request.imdb);
    }
    if (request.q !== undefined) {
      url.searchParams.set("q", request.q);
    }
    if (request.limit !== undefined) {
      url.searchParams.set("limit", String(request.limit));
    }

    return this.httpClient.getJson(url, { signal });
  }
}
