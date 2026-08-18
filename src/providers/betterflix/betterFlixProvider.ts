import type { StreamProvider, StreamQuery } from "../../types/streamProvider.js";
import type { StreamResult } from "../../types/streamResult.js";

const TMDB_API_KEY = process.env.TMDB_API_KEY || "15d2ea6d0dc1d476efbca3eba2b9bbfb";
const DEFAULT_BETTERFLIX_KEY = process.env.BETTERFLIX_API_KEY || "bf_dev_eb351f06a9f9035f7017770a";

interface TmdbLookupResult {
  tmdbId: number;
  mediaType: "movie" | "tv";
}

const tmdbCache = new Map<string, TmdbLookupResult | null>();

async function getTmdbLookup(imdbId: string, signal?: AbortSignal): Promise<TmdbLookupResult | null> {
  const cleanId = imdbId.split(":")[0];
  if (!cleanId || !/^tt\d+$/.test(cleanId)) return null;

  if (tmdbCache.has(cleanId)) {
    return tmdbCache.get(cleanId)!;
  }

  try {
    const url = `https://api.themoviedb.org/3/find/${encodeURIComponent(cleanId)}?api_key=${TMDB_API_KEY}&external_source=imdb_id`;
    const res = await fetch(url, { signal });
    if (!res.ok) {
      tmdbCache.set(cleanId, null);
      return null;
    }

    const data = (await res.json()) as {
      movie_results?: Array<{ id: number }>;
      tv_results?: Array<{ id: number }>;
    };

    const movie = data.movie_results?.[0];
    const tv = data.tv_results?.[0];

    if (movie?.id) {
      const result: TmdbLookupResult = { tmdbId: movie.id, mediaType: "movie" };
      tmdbCache.set(cleanId, result);
      return result;
    }

    if (tv?.id) {
      const result: TmdbLookupResult = { tmdbId: tv.id, mediaType: "tv" };
      tmdbCache.set(cleanId, result);
      return result;
    }
  } catch {
    // Return null on failure
  }

  tmdbCache.set(cleanId, null);
  return null;
}

export class BetterFlixProvider implements StreamProvider {
  readonly id = "betterflix";
  readonly name = "BetterFlix 🍿";
  private readonly apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || DEFAULT_BETTERFLIX_KEY;
  }

  async getStreams(query: StreamQuery, signal: AbortSignal): Promise<StreamResult[]> {
    if (query.type !== "movie" && query.type !== "series") {
      return [];
    }

    const parts = query.id.split(":");
    const cleanImdb = parts[0];
    if (!cleanImdb) return [];

    const tmdbInfo = await getTmdbLookup(cleanImdb, signal);
    if (!tmdbInfo) {
      return [];
    }

    let embedUrl: string;
    let titleLabel: string;

    if (query.type === "movie") {
      embedUrl = `https://betterflix.lat/api/player?id=${tmdbInfo.tmdbId}&type=movie&key=${this.apiKey}`;
      titleLabel = "Player Web • 🍿 Filme HD (Dublado / Legendado)";
    } else {
      const season = parts[1] ?? "1";
      const episode = parts[2] ?? "1";
      embedUrl = `https://betterflix.lat/api/player?id=${tmdbInfo.tmdbId}&type=tv&season=${season}&episode=${episode}&key=${this.apiKey}`;
      titleLabel = `Player Web • 🍿 Temp ${season} Ep ${episode} HD (Dublado / Legendado)`;
    }

    return [
      {
        name: this.name,
        title: titleLabel,
        url: embedUrl,
      },
    ];
  }
}
