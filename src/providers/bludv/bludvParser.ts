import type { Parser } from "../../types/parser.js";
import type { BluDVItem, BluDVRawResponse, BluDVResponse } from "./bludvTypes.js";

const INFO_HASH_PATTERN = /^[a-fA-F0-9]{40}$/;
const IMDB_PATTERN = /^tt\d+$/;

function parseInfoHash(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().toLowerCase();
  return INFO_HASH_PATTERN.test(trimmed) ? trimmed : undefined;
}

function parseImdbId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return IMDB_PATTERN.test(trimmed) ? trimmed : undefined;
}

function parseTitle(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseMagnet(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.startsWith("magnet:?") ? trimmed : undefined;
}

function parseFiles(value: unknown): readonly { readonly path: string; readonly size?: string }[] {
  if (!Array.isArray(value)) return [];
  const result: { readonly path: string; readonly size?: string }[] = [];

  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as Record<string, unknown>;
    const path = typeof record.path === "string" ? record.path.trim() : "";
    if (!path) continue;
    const size = typeof record.size === "string" ? record.size.trim() : undefined;
    result.push({ path, ...(size ? { size } : {}) });
  }

  return result;
}

function parseItem(raw: unknown): BluDVItem | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const record = raw as Record<string, unknown>;

  const title = parseTitle(record.title);
  if (!title) return undefined;

  const infoHash = parseInfoHash(record.infoHash ?? record.info_hash);
  const magnet = parseMagnet(record.magnet);
  if (!infoHash && !magnet) return undefined;

  const imdb = parseImdbId(record.imdb);
  const audio = Array.isArray(record.audio)
    ? record.audio.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  const trackers = Array.isArray(record.trackers)
    ? record.trackers.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  const size = typeof record.size === "string" ? record.size.trim() : undefined;
  const files = parseFiles(record.files);
  const rawPeers = typeof record.peers === "object" && record.peers !== null ? (record.peers as Record<string, unknown>) : {};
  const seeders = typeof rawPeers.seeders === "number" && rawPeers.seeders >= 0 ? rawPeers.seeders : undefined;
  const leechers = typeof rawPeers.leechers === "number" && rawPeers.leechers >= 0 ? rawPeers.leechers : undefined;

  return {
    title,
    ...(imdb ? { imdb } : {}),
    audio,
    ...(magnet ? { magnet } : {}),
    ...(infoHash ? { infoHash } : {}),
    trackers,
    ...(size ? { size } : {}),
    files,
    peers: {
      ...(seeders !== undefined ? { seeders } : {}),
      ...(leechers !== undefined ? { leechers } : {}),
    },
    ...(record.isMock === true ? { isMock: true } : {}),
  };
}

export class BluDVParser implements Parser<BluDVRawResponse, BluDVResponse> {
  parse(rawResponse: BluDVRawResponse): BluDVResponse {
    if (typeof rawResponse !== "object" || rawResponse === null) {
      return { items: [] };
    }

    const record = rawResponse as Record<string, unknown>;
    const rawItems = Array.isArray(record.results)
      ? record.results
      : Array.isArray(record.items)
        ? record.items
        : [];

    const items: BluDVItem[] = [];
    for (const rawItem of rawItems) {
      const parsed = parseItem(rawItem);
      if (parsed) {
        items.push(parsed);
      }
    }

    const count = typeof record.count === "number" ? record.count : items.length;
    return { items, count };
  }
}
