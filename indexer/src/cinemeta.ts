/**
 * Cinemeta & TMDB helper — resolves IMDb ID (e.g. tt1375666) to Portuguese title,
 * original title and release year for both movies and series.
 */

export interface ResolvedTitle {
  title: string;
  originalTitle?: string;
  year?: number;
}

const cache = new Map<string, ResolvedTitle>();
const TMDB_API_KEY = "15d2ea6d0dc1d476efbca3eba2b9bbfb";

export async function resolveImdbTitle(
  imdbId: string,
  signal: AbortSignal,
): Promise<ResolvedTitle | null> {
  const cleanId = imdbId.split(":")[0];
  if (!cleanId || !/^tt\d+$/.test(cleanId)) return null;

  if (cache.has(cleanId)) {
    return cache.get(cleanId)!;
  }

  // 1. Try TMDB find endpoint with pt-BR language for PT-BR translated title
  try {
    const tmdbUrl = `https://api.themoviedb.org/3/find/${encodeURIComponent(cleanId)}?api_key=${TMDB_API_KEY}&external_source=imdb_id&language=pt-BR`;
    const resp = await fetch(tmdbUrl, { signal });
    if (resp.ok) {
      const data = (await resp.json()) as {
        movie_results?: Array<{ title?: string; original_title?: string; release_date?: string }>;
        tv_results?: Array<{ name?: string; original_name?: string; first_air_date?: string }>;
      };

      const movie = data.movie_results?.[0];
      const tv = data.tv_results?.[0];

      if (movie) {
        const title = movie.title;
        const originalTitle = movie.original_title;
        const year = movie.release_date ? Number(movie.release_date.slice(0, 4)) : undefined;

        if (title) {
          const res: ResolvedTitle = {
            title,
            ...(originalTitle && originalTitle !== title ? { originalTitle } : {}),
            ...(year && !Number.isNaN(year) ? { year } : {}),
          };
          cache.set(cleanId, res);
          return res;
        }
      } else if (tv) {
        const title = tv.name;
        const originalTitle = tv.original_name;
        const year = tv.first_air_date ? Number(tv.first_air_date.slice(0, 4)) : undefined;

        if (title) {
          const res: ResolvedTitle = {
            title,
            ...(originalTitle && originalTitle !== title ? { originalTitle } : {}),
            ...(year && !Number.isNaN(year) ? { year } : {}),
          };
          cache.set(cleanId, res);
          return res;
        }
      }
    }
  } catch {
    // Ignore TMDB error and fall back to Cinemeta
  }

  // 2. Fall back to Cinemeta (try movie first, then series)
  for (const type of ["movie", "series"]) {
    try {
      const url = `https://v3-cinemeta.strem.fun/meta/${type}/${encodeURIComponent(cleanId)}.json`;
      const resp = await fetch(url, { signal });
      if (resp.ok) {
        const data = (await resp.json()) as { meta?: { name?: string; year?: number } };
        if (data.meta?.name) {
          const res: ResolvedTitle = {
            title: data.meta.name,
            year: typeof data.meta.year === "number" ? data.meta.year : undefined,
          };
          cache.set(cleanId, res);
          return res;
        }
      }
    } catch {
      // Ignore Cinemeta fetch errors
    }
  }

  return null;
}
