import type { Parser } from "../../types/parser.js";
import type { FixtureStreamCandidate } from "./fixtureTypes.js";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isMediaType(value: unknown): value is FixtureStreamCandidate["type"] {
  return value === "movie" || value === "series";
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function toCandidate(value: unknown): FixtureStreamCandidate | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const entry = value as Record<string, unknown>;

  if (
    !isMediaType(entry.type) ||
    !isNonEmptyString(entry.id) ||
    !isNonEmptyString(entry.title) ||
    !isNonEmptyString(entry.quality) ||
    !isNonEmptyString(entry.language) ||
    !isNonEmptyString(entry.url) ||
    !isHttpUrl(entry.url)
  ) {
    return null;
  }

  return {
    type: entry.type,
    id: entry.id,
    title: entry.title,
    quality: entry.quality,
    language: entry.language,
    url: entry.url,
  };
}

export class FixtureParser implements Parser<string, FixtureStreamCandidate[]> {
  parse(input: string): FixtureStreamCandidate[] {
    const payload = JSON.parse(input) as unknown;

    if (typeof payload !== "object" || payload === null) {
      return [];
    }

    const streams = (payload as Record<string, unknown>).streams;

    if (!Array.isArray(streams)) {
      return [];
    }

    return streams
      .map(toCandidate)
      .filter((candidate): candidate is FixtureStreamCandidate => candidate !== null);
  }
}
