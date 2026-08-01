import type { Parser } from "../../types/parser.js";
import type { HttpFixtureCandidate } from "./httpFixtureTypes.js";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isMediaType(value: unknown): value is HttpFixtureCandidate["type"] {
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

function parseCandidate(value: unknown): HttpFixtureCandidate | null {
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
    id: entry.id.trim(),
    title: entry.title.trim(),
    quality: entry.quality.trim(),
    language: entry.language.trim(),
    url: entry.url.trim(),
  };
}

export class HttpFixtureParser implements Parser<unknown, HttpFixtureCandidate[]> {
  parse(input: unknown): HttpFixtureCandidate[] {
    if (typeof input !== "object" || input === null) {
      return [];
    }

    const streams = (input as Record<string, unknown>).streams;

    if (!Array.isArray(streams)) {
      return [];
    }

    return streams
      .map(parseCandidate)
      .filter((candidate): candidate is HttpFixtureCandidate => candidate !== null);
  }
}
