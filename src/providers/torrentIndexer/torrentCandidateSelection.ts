import type { StreamQuery } from "../../types/streamProvider.js";
import {
  isNormalizedInfoHash,
  type TorrentCandidateFile,
  type TorrentCandidateResolutionRequest,
} from "./torrentCandidateResolver.js";
import type { TorrentIndexerFile, TorrentIndexerItem } from "./torrentIndexerTypes.js";

const VIDEO_EXTENSION_PATTERN = /\.(?:avi|m2ts|m4v|mkv|mov|mp4|mpeg|mpg|ts|webm)$/i;
const MAX_PATH_LENGTH = 1_024;
const MAX_PATH_SEGMENT_LENGTH = 255;
const MAX_FILES_PER_CANDIDATE = 100;
const CONFUSABLE_SEPARATOR_PATTERN = /[∕⁄＼]/u;
const SAMPLE_OR_TRAILER_PATTERN = /(?:^|[._ -])(?:sample|trailer)(?:[._ -]|$)/i;
const SIZE_PATTERN = /^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB)$/i;
const SIZE_FACTORS: Readonly<Record<string, number>> = Object.freeze({
  B: 1,
  KB: 1_000,
  MB: 1_000_000,
  GB: 1_000_000_000,
  TB: 1_000_000_000_000,
});

function normalizeSize(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const match = SIZE_PATTERN.exec(value.trim());
  if (match === null) return undefined;
  const amount = Number(match[1]);
  const factor = SIZE_FACTORS[match[2]?.toUpperCase() ?? ""];
  const bytes = amount * (factor ?? Number.NaN);
  return Number.isSafeInteger(bytes) && bytes > 0 ? bytes : undefined;
}

function normalizeVideoFile(file: TorrentIndexerFile): TorrentCandidateFile | null {
  const path = file.path;
  const segments = path.split("/");
  if (path.length === 0
    || path.length > MAX_PATH_LENGTH
    || path !== path.trim()
    || path.startsWith("/")
    || path.includes("\\")
    || /^[a-z]:/i.test(path)
    || /[\u0000-\u001f\u007f]/.test(path)
    || path.includes("%")
    || CONFUSABLE_SEPARATOR_PATTERN.test(path)
    || segments.some((segment) => segment === ""
      || segment === "."
      || segment === ".."
      || segment.length > MAX_PATH_SEGMENT_LENGTH
      || segment.endsWith(".")
      || segment.endsWith(" "))
    || SAMPLE_OR_TRAILER_PATTERN.test(segments.at(-1) ?? "")
    || !VIDEO_EXTENSION_PATTERN.test(path)) {
    return null;
  }

  const sizeBytes = normalizeSize(file.size);
  return Object.freeze({ path, ...(sizeBytes === undefined ? {} : { sizeBytes }) });
}

export function selectTorrentCandidates(
  items: readonly TorrentIndexerItem[],
  imdb: string,
  query: StreamQuery,
  signal: AbortSignal,
  maxCandidates: number,
): readonly TorrentCandidateResolutionRequest[] {
  const selected: TorrentCandidateResolutionRequest[] = [];
  const seenHashes = new Set<string>();

  for (const item of items) {
    if (selected.length >= maxCandidates) break;
    if (item.imdb !== imdb || typeof item.infoHash !== "string") {
      continue;
    }
    const infoHash = item.infoHash.toLowerCase();
    if (!isNormalizedInfoHash(infoHash) || item.infoHash.length !== infoHash.length || seenHashes.has(infoHash)) {
      continue;
    }

    if (item.files.length > MAX_FILES_PER_CANDIDATE) continue;
    const files = item.files.flatMap((file) => {
      const normalized = normalizeVideoFile(file);
      return normalized === null ? [] : [normalized];
    });
    if (item.files.length > 0 && files.length === 0) continue;

    seenHashes.add(infoHash);
    selected.push(Object.freeze({
      infoHash,
      ...(item.magnet === undefined ? {} : { magnet: item.magnet }),
      files: Object.freeze(files),
      media: Object.freeze({ id: query.id, type: query.type }),
      signal,
    }));
  }

  return Object.freeze(selected);
}
