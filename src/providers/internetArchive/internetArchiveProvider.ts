import type { StreamProvider, StreamQuery } from "../../types/streamProvider.js";
import type { StreamResult } from "../../types/streamResult.js";
import { InternetArchiveDataClient } from "./internetArchiveDataClient.js";
import { isAcceptedInternetArchiveLicense } from "./internetArchiveLicense.js";
import { InternetArchiveParser } from "./internetArchiveParser.js";
import type { InternetArchiveFile, InternetArchiveItem } from "./internetArchiveTypes.js";

const DEFAULT_DOWNLOAD_BASE_URL = "https://archive.org/download/";
const DEFAULT_MIN_VIDEO_FILE_SIZE_BYTES = 1_048_576;
const IMDB_ID_PATTERN = /^tt\d+$/;

export interface InternetArchiveProviderOptions {
  downloadBaseUrl?: string | URL;
  minVideoFileSizeBytes?: number;
}

interface RankedVideoFile {
  file: InternetArchiveFile;
  kind: "MP4" | "WebM";
  formatRank: number;
}

function rankVideoFile(
  file: InternetArchiveFile,
  minVideoFileSizeBytes: number,
): RankedVideoFile | null {
  if (file.size === undefined || file.size < minVideoFileSizeBytes) {
    return null;
  }

  const name = file.name.toLowerCase();
  const format = file.format.toLowerCase();

  if (
    name.endsWith(".mp4") &&
    (format.includes("mpeg4") || format.includes("h.264") || format.includes("h264"))
  ) {
    return { file, kind: "MP4", formatRank: 0 };
  }

  if (name.endsWith(".webm") && format.includes("webm")) {
    return { file, kind: "WebM", formatRank: 1 };
  }

  return null;
}

function selectPreferredVideo(
  item: InternetArchiveItem,
  minVideoFileSizeBytes: number,
): RankedVideoFile | null {
  const seenNames = new Set<string>();
  const candidates: RankedVideoFile[] = [];

  for (const file of item.files) {
    const normalizedName = file.name.toLowerCase();

    if (seenNames.has(normalizedName)) {
      continue;
    }

    seenNames.add(normalizedName);
    const candidate = rankVideoFile(file, minVideoFileSizeBytes);

    if (candidate !== null) {
      candidates.push(candidate);
    }
  }

  candidates.sort((left, right) => {
    return (
      left.formatRank - right.formatRank ||
      (right.file.height ?? 0) - (left.file.height ?? 0) ||
      (right.file.width ?? 0) - (left.file.width ?? 0) ||
      (right.file.size ?? 0) - (left.file.size ?? 0)
    );
  });

  return candidates[0] ?? null;
}

function encodeFilePath(name: string): string {
  return name.split("/").map(encodeURIComponent).join("/");
}

export class InternetArchiveProvider implements StreamProvider {
  readonly id = "internet-archive";
  readonly name = "Internet Archive";
  private readonly downloadBaseUrl: string;
  private readonly minVideoFileSizeBytes: number;

  constructor(
    private readonly client: InternetArchiveDataClient,
    private readonly parser: InternetArchiveParser,
    options: InternetArchiveProviderOptions = {},
  ) {
    const baseUrl = (options.downloadBaseUrl ?? DEFAULT_DOWNLOAD_BASE_URL).toString();
    this.downloadBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
    this.minVideoFileSizeBytes =
      options.minVideoFileSizeBytes ?? DEFAULT_MIN_VIDEO_FILE_SIZE_BYTES;

    if (!Number.isInteger(this.minVideoFileSizeBytes) || this.minVideoFileSizeBytes < 1) {
      throw new Error(`Invalid minimum video file size: ${this.minVideoFileSizeBytes}`);
    }
  }

  async getStreams(query: StreamQuery, signal: AbortSignal): Promise<StreamResult[]> {
    if (query.type !== "movie" || !IMDB_ID_PATTERN.test(query.id)) {
      return [];
    }

    const expectedExternalIdentifier = `urn:imdb:${query.id}`;
    const searchPayload = await this.client.searchMoviesByImdbId(query.id, signal);
    const matches = this.parser.parseSearch(searchPayload).filter(
      (item) =>
        item.mediaType === "movies" &&
        item.externalIdentifiers.includes(expectedExternalIdentifier),
    );
    const streams: StreamResult[] = [];
    const seenUrls = new Set<string>();

    for (const match of matches) {
      const metadataPayload = await this.client.getMetadata(match.identifier, signal);
      const item = this.parser.parseMetadata(metadataPayload);

      if (
        item === null ||
        item.identifier !== match.identifier ||
        item.mediaType !== "movies" ||
        !item.externalIdentifiers.includes(expectedExternalIdentifier) ||
        !item.licenseUrls.some(isAcceptedInternetArchiveLicense)
      ) {
        continue;
      }

      const selected = selectPreferredVideo(item, this.minVideoFileSizeBytes);

      if (selected === null) {
        continue;
      }

      const url = new URL(
        `${encodeURIComponent(item.identifier)}/${encodeFilePath(selected.file.name)}`,
        this.downloadBaseUrl,
      ).toString();

      if (seenUrls.has(url)) {
        continue;
      }

      seenUrls.add(url);
      const quality = selected.file.height === undefined ? "" : ` ${selected.file.height}p`;
      streams.push({
        name: this.name,
        title: `Internet Archive | ${item.title} | ${selected.kind}${quality}`,
        url,
      });
    }

    return streams;
  }
}
