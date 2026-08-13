import type { HttpDataClient } from "../../clients/http/httpDataClient.js";
import type { DataClient } from "../../types/dataClient.js";
import type { TorrentioClientOptions, TorrentioRawResponse, TorrentioRequest } from "./torrentioTypes.js";

const DEFAULT_TORRENTIO_BASE_URL = "https://torrentio.strem.fun";

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
    throw new Error("Invalid Torrentio base URL");
  }

  url.pathname = `${url.pathname.replace(/\/+$/, "")}/`;
  return url;
}

export class TorrentioClient implements DataClient<TorrentioRequest, TorrentioRawResponse> {
  private readonly baseUrl: URL;
  private readonly isMockMode: boolean;

  constructor(
    private readonly httpClient: HttpDataClient,
    options?: TorrentioClientOptions,
  ) {
    const raw = (options?.baseUrl ?? DEFAULT_TORRENTIO_BASE_URL).toString().trim().toLowerCase();
    this.isMockMode = raw === "mock" || raw === "http://mock" || raw === "https://mock" || raw === "http://mock.invalid/";
    this.baseUrl = normalizeBaseUrl(options?.baseUrl ?? DEFAULT_TORRENTIO_BASE_URL);
  }

  async fetch(request: TorrentioRequest, signal: AbortSignal): Promise<TorrentioRawResponse> {
    if (this.isMockMode) {
      return {
        streams: [
          {
            name: "Torrentio\n1080p",
            title: `Torrentio | ${request.type === "movie" ? "Movie" : "Series"} Stream (${request.id})\n👥 1200 💾 3.2 GB`,
            infoHash: "0123456789abcdef0123456789abcdef01234567",
            fileIdx: 0,
            isMock: true,
          },
        ],
      };
    }

    const path = `stream/${encodeURIComponent(request.type)}/${encodeURIComponent(request.id)}.json`;
    const url = new URL(path, this.baseUrl);

    return this.httpClient.getJson(url, { signal });
  }
}
