import type { Parser } from "../../types/parser.js";
import type {
  TorrentIndexerAudio,
  TorrentIndexerFile,
  TorrentIndexerItem,
  TorrentIndexerRawResponse,
  TorrentIndexerResponse,
} from "./torrentIndexerTypes.js";

const INFO_HASH_PATTERN = /^[a-fA-F0-9]{40}$/;
const IMDB_ID_PATTERN = /^tt\d{7,10}$/;
const IMDB_URL_PATTERN = /^https:\/\/(?:www\.)?imdb\.com\/title\/(tt\d{7,10})\/?$/;
const MAX_TEXT_LENGTH = 2_048;
const MAX_MAGNET_LENGTH = 16_384;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= MAX_TEXT_LENGTH ? normalized : undefined;
}

function optionalNonNegativeInteger(value: unknown): number | undefined | null {
  if (value === undefined || value === null) return undefined;
  return Number.isInteger(value) && (value as number) >= 0 ? (value as number) : null;
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(optionalString)
    .filter((entry): entry is string => entry !== undefined);
}

function parseAudio(value: unknown): TorrentIndexerAudio[] {
  return parseStringArray(value);
}

function parseFiles(value: unknown): TorrentIndexerFile[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((candidate) => {
    if (!isObject(candidate)) return [];
    const path = optionalString(candidate.path);
    if (path === undefined || path.includes("\0")) return [];
    const size = optionalString(candidate.size);
    return [{ path, ...(size === undefined ? {} : { size }) }];
  });
}

function parseImdb(value: unknown): string | undefined | null {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") return null;
  const normalized = value.trim();

  if (IMDB_ID_PATTERN.test(normalized)) return normalized;
  const urlMatch = IMDB_URL_PATTERN.exec(normalized);
  return urlMatch?.[1] ?? null;
}

function parseInfoHash(value: unknown): string | undefined | null {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !INFO_HASH_PATTERN.test(value.trim())) return null;
  return value.trim().toLowerCase();
}

function parseMagnet(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.startsWith("magnet:?") && normalized.length <= MAX_MAGNET_LENGTH
    ? normalized
    : undefined;
}

function parseItem(value: unknown): TorrentIndexerItem | null {
  if (!isObject(value)) return null;

  const title = optionalString(value.title);
  const infoHash = parseInfoHash(value.info_hash);
  const imdb = parseImdb(value.imdb);
  const seeders = optionalNonNegativeInteger(value.seed_count);
  const leechers = optionalNonNegativeInteger(value.leech_count);

  if (title === undefined || infoHash === null || imdb === null || seeders === null || leechers === null) {
    return null;
  }

  const originalTitle = optionalString(value.original_title);
  const details = optionalString(value.details);
  const year = optionalString(value.year);
  const size = optionalString(value.size);
  const magnet = parseMagnet(value.magnet_link);

  return {
    title,
    ...(originalTitle === undefined ? {} : { originalTitle }),
    ...(details === undefined ? {} : { details }),
    ...(year === undefined ? {} : { year }),
    ...(imdb === undefined ? {} : { imdb }),
    audio: parseAudio(value.audio),
    ...(magnet === undefined ? {} : { magnet }),
    ...(infoHash === undefined ? {} : { infoHash }),
    trackers: parseStringArray(value.trackers),
    ...(size === undefined ? {} : { size }),
    files: parseFiles(value.files),
    peers: {
      ...(seeders === undefined ? {} : { seeders }),
      ...(leechers === undefined ? {} : { leechers }),
    },
  };
}

function parseOptionalCount(value: unknown): number | undefined {
  return Number.isInteger(value) && (value as number) >= 0 ? (value as number) : undefined;
}

export class TorrentIndexerParser
  implements Parser<TorrentIndexerRawResponse, TorrentIndexerResponse>
{
  parse(input: TorrentIndexerRawResponse): TorrentIndexerResponse {
    if (!isObject(input) || !Array.isArray(input.results)) return { items: [] };

    const items = input.results
      .map(parseItem)
      .filter((item): item is TorrentIndexerItem => item !== null);
    const count = parseOptionalCount(input.count);
    const indexedCount = parseOptionalCount(input.indexed_count);

    return {
      items,
      ...(count === undefined ? {} : { count }),
      ...(indexedCount === undefined ? {} : { indexedCount }),
    };
  }
}
