import type { Parser } from "../../types/parser.js";
import type { TorrentDosFilmesItem, TorrentDosFilmesRawResponse, TorrentDosFilmesResponse } from "./torrentDosFilmesTypes.js";

function parseInfoHash(hash: unknown): string | undefined {
  if (typeof hash !== "string") return undefined;
  const trimmed = hash.trim().toLowerCase();
  return /^[a-f0-9]{40}$/.test(trimmed) ? trimmed : undefined;
}

function parseMagnet(magnet: unknown): string | undefined {
  if (typeof magnet !== "string") return undefined;
  const trimmed = magnet.trim();
  return trimmed.startsWith("magnet:?") ? trimmed : undefined;
}

function parseItem(raw: unknown): TorrentDosFilmesItem | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const record = raw as Record<string, unknown>;

  const title = typeof record.title === "string" ? record.title.trim() : undefined;
  if (!title) return undefined;

  const infoHash = parseInfoHash(record.infoHash ?? record.info_hash);
  const magnet = parseMagnet(record.magnet);
  if (!infoHash && !magnet) return undefined;

  const imdb = typeof record.imdb === "string" ? record.imdb.trim() : undefined;
  const audio = Array.isArray(record.audio)
    ? record.audio.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : ["Português (Dublado)"];
  const quality = typeof record.quality === "string" ? record.quality.trim() : undefined;
  const size = typeof record.size === "string" ? record.size.trim() : undefined;
  const seeders = typeof record.seeders === "number" && record.seeders >= 0 ? record.seeders : undefined;
  const isMock = record.isMock === true;

  return {
    title,
    ...(imdb ? { imdb } : {}),
    audio,
    ...(quality ? { quality } : {}),
    ...(magnet ? { magnet } : {}),
    ...(infoHash ? { infoHash } : {}),
    ...(size ? { size } : {}),
    ...(seeders !== undefined ? { seeders } : {}),
    ...(isMock ? { isMock: true } : {}),
  };
}

export class TorrentDosFilmesParser implements Parser<TorrentDosFilmesRawResponse, TorrentDosFilmesResponse> {
  parse(raw: TorrentDosFilmesRawResponse): TorrentDosFilmesResponse {
    if (typeof raw !== "object" || raw === null) {
      return { items: [], count: 0 };
    }

    const record = raw as Record<string, unknown>;
    const rawResults = Array.isArray(record.results)
      ? record.results
      : Array.isArray(record.items)
        ? record.items
        : [];

    const items = rawResults
      .map(parseItem)
      .filter((item): item is TorrentDosFilmesItem => item !== undefined);

    return { items, count: items.length };
  }
}
