import type { Parser } from "../../types/parser.js";
import type { TorrentioBehaviorHints, TorrentioRawResponse, TorrentioResponse, TorrentioStreamItem } from "./torrentioTypes.js";

function parseInfoHash(hash: unknown): string | undefined {
  if (typeof hash !== "string") return undefined;
  const trimmed = hash.trim().toLowerCase();
  return /^[a-f0-9]{40}$/.test(trimmed) ? trimmed : undefined;
}

function parseBehaviorHints(raw: unknown): TorrentioBehaviorHints | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const record = raw as Record<string, unknown>;

  const bencodeUrl = typeof record.bencodeUrl === "string" ? record.bencodeUrl.trim() : undefined;
  const bingeGroup = typeof record.bingeGroup === "string" ? record.bingeGroup.trim() : undefined;
  const filename = typeof record.filename === "string" ? record.filename.trim() : undefined;

  if (!bencodeUrl && !bingeGroup && !filename) return undefined;

  return {
    ...(bencodeUrl ? { bencodeUrl } : {}),
    ...(bingeGroup ? { bingeGroup } : {}),
    ...(filename ? { filename } : {}),
  };
}

function parseStreamItem(raw: unknown): TorrentioStreamItem | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const record = raw as Record<string, unknown>;

  const name = typeof record.name === "string" ? record.name.trim() : undefined;
  const title = typeof record.title === "string" ? record.title.trim() : undefined;
  const infoHash = parseInfoHash(record.infoHash);
  const fileIdx = typeof record.fileIdx === "number" && Number.isInteger(record.fileIdx) && record.fileIdx >= 0
    ? record.fileIdx
    : undefined;
  const url = typeof record.url === "string" && (record.url.startsWith("http:") || record.url.startsWith("https:"))
    ? record.url.trim()
    : undefined;
  const behaviorHints = parseBehaviorHints(record.behaviorHints);
  const isMock = record.isMock === true;

  if (!infoHash && !url) return undefined;

  return {
    ...(name ? { name } : {}),
    ...(title ? { title } : {}),
    ...(infoHash ? { infoHash } : {}),
    ...(fileIdx !== undefined ? { fileIdx } : {}),
    ...(url ? { url } : {}),
    ...(behaviorHints ? { behaviorHints } : {}),
    ...(isMock ? { isMock: true } : {}),
  };
}

export class TorrentioParser implements Parser<TorrentioRawResponse, TorrentioResponse> {
  parse(raw: TorrentioRawResponse): TorrentioResponse {
    if (typeof raw !== "object" || raw === null) {
      return { streams: [] };
    }

    const record = raw as Record<string, unknown>;
    const rawStreams = Array.isArray(record.streams) ? record.streams : [];

    const streams = rawStreams
      .map(parseStreamItem)
      .filter((item): item is TorrentioStreamItem => item !== undefined);

    return { streams };
  }
}
