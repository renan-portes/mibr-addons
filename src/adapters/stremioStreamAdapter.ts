import type { StremioStream } from "../types/stremio.js";
import type { StreamResult } from "../types/streamResult.js";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isValidStreamResult(value: unknown): value is StreamResult {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<StreamResult>;

  if (
    !isNonEmptyString(candidate.name) ||
    !isNonEmptyString(candidate.title) ||
    (!isNonEmptyString(candidate.url) && !isNonEmptyString(candidate.infoHash))
  ) {
    return false;
  }

  if (candidate.infoHash) {
    return true;
  }

  if (candidate.url && candidate.url.startsWith("magnet:?")) {
    return true;
  }

  try {
    const url = new URL(candidate.url!);
    return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "magnet:";
  } catch {
    return false;
  }
}

export function toStremioStreams(results: readonly unknown[]): StremioStream[] {
  return results.filter(isValidStreamResult).map((result) => {
    const stream: StremioStream = {
      name: result.name,
      title: result.title,
    };

    if (result.infoHash) {
      stream.infoHash = result.infoHash;
      if (result.fileIdx !== undefined) stream.fileIdx = result.fileIdx;
    } else if (result.url && result.url.startsWith("magnet:?")) {
      const match = /btih:([a-fA-F0-9]{40})/i.exec(result.url);
      if (match && match[1]) {
        stream.infoHash = match[1].toLowerCase();
      } else {
        stream.url = result.url;
      }
    } else if (result.url) {
      stream.url = result.url;
    }

    return stream;
  });
}
