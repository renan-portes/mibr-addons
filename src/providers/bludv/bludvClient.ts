import type { HttpDataClient } from "../../clients/http/httpDataClient.js";
import type { DataClient } from "../../types/dataClient.js";
import type { BluDVRawResponse, BluDVRequest } from "./bludvTypes.js";

export interface BluDVClientOptions {
  readonly baseUrl: string | URL;
  readonly indexerName?: string;
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
    throw new Error("Invalid BluDV base URL");
  }

  url.pathname = `${url.pathname.replace(/\/+$/, "")}/`;
  return url;
}

export class BluDVClient implements DataClient<BluDVRequest, BluDVRawResponse> {
  readonly indexerName: string;
  private readonly baseUrl: URL;

  constructor(
    private readonly httpClient: HttpDataClient,
    options: BluDVClientOptions,
  ) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.indexerName = options.indexerName?.trim() || "bludv";
  }

  async fetch(request: BluDVRequest, signal: AbortSignal): Promise<BluDVRawResponse> {
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
