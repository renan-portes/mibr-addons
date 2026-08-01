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
    !isNonEmptyString(candidate.url)
  ) {
    return false;
  }

  try {
    const url = new URL(candidate.url);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function toStremioStreams(results: readonly unknown[]): StremioStream[] {
  return results.filter(isValidStreamResult).map((result) => ({
    name: result.name,
    title: result.title,
    url: result.url,
  }));
}
