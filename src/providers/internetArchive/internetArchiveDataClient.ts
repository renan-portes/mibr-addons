import type { HttpDataClient } from "../../clients/http/httpDataClient.js";

const DEFAULT_SEARCH_URL = "https://archive.org/advancedsearch.php";
const DEFAULT_METADATA_BASE_URL = "https://archive.org/metadata/";

export interface InternetArchiveDataClientOptions {
  searchUrl?: string | URL;
  metadataBaseUrl?: string | URL;
}

export class InternetArchiveDataClient {
  private readonly searchUrl: string | URL;
  private readonly metadataBaseUrl: string;

  constructor(
    private readonly httpClient: HttpDataClient,
    options: InternetArchiveDataClientOptions = {},
  ) {
    this.searchUrl = options.searchUrl ?? DEFAULT_SEARCH_URL;
    this.metadataBaseUrl = (options.metadataBaseUrl ?? DEFAULT_METADATA_BASE_URL).toString();
  }

  async searchMoviesByImdbId(imdbId: string, signal: AbortSignal): Promise<unknown> {
    const url = new URL(this.searchUrl);
    url.searchParams.set(
      "q",
      `external-identifier:\"urn:imdb:${imdbId}\" AND mediatype:movies`,
    );
    url.searchParams.append("fl[]", "identifier");
    url.searchParams.append("fl[]", "title");
    url.searchParams.append("fl[]", "mediatype");
    url.searchParams.append("fl[]", "external-identifier");
    url.searchParams.set("rows", "10");
    url.searchParams.set("page", "1");
    url.searchParams.set("output", "json");

    return this.httpClient.getJson(url, { signal });
  }

  async getMetadata(identifier: string, signal: AbortSignal): Promise<unknown> {
    const baseUrl = this.metadataBaseUrl.endsWith("/")
      ? this.metadataBaseUrl
      : `${this.metadataBaseUrl}/`;
    const url = new URL(encodeURIComponent(identifier), baseUrl);

    return this.httpClient.getJson(url, { signal });
  }
}
