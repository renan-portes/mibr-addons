/**
 * Cinemeta helper — resolves IMDb ID (e.g. tt1375666) to movie title and year
 * using Stremio's free, public Cinemeta API.
 */

interface CinemetaMeta {
  name?: string;
  year?: number;
}

interface CinemetaResponse {
  meta?: CinemetaMeta;
}

const cache = new Map<string, { title: string; year?: number }>();

export async function resolveImdbTitle(imdbId: string, signal: AbortSignal): Promise<{ title: string; year?: number } | null> {
  if (cache.has(imdbId)) {
    return cache.get(imdbId)!;
  }

  try {
    const url = `https://v3-cinemeta.strem.fun/meta/movie/${encodeURIComponent(imdbId)}.json`;
    const resp = await fetch(url, { signal });
    if (!resp.ok) return null;

    const data = (await resp.json()) as CinemetaResponse;
    if (data.meta?.name) {
      const result = { title: data.meta.name, year: data.meta.year };
      cache.set(imdbId, result);
      return result;
    }
  } catch {
    // Ignore fetch errors
  }

  return null;
}
