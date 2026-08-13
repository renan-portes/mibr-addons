/**
 * TorrentDosFilmes scraper — searches torrentdosfilmes2.site (or configured alternative)
 * for Brazilian PT-BR dubbed content by IMDb ID or title.
 *
 * Strategy:
 * 1. Try search by IMDb ID (e.g. tt1375666) or resolved title (via Cinemeta)
 * 2. GET search results page via FlareSolverr
 * 3. Extract individual movie post URLs from results
 * 4. For each post URL, GET page and extract magnet links + metadata
 * 5. Return structured results
 *
 * ENV:
 *   TORRENTDOSFILMES_SITE_URL — base URL (default: https://torrentdosfilmes2.site)
 */

import { resolveImdbTitle } from "../cinemeta.js";
import { flareGet } from "../flaresolverr.js";
import {
  buildSearchUrl,
  extractAudio,
  extractInfoHash,
  extractLinks,
  extractMagnets,
  extractPageTitle,
  extractQuality,
  extractSize,
} from "../parsers.js";
import type { IndexerRequest, IndexerResponse, TorrentResult } from "../types.js";

const TDF_SITE_URL = (process.env.TORRENTDOSFILMES_SITE_URL ?? "https://torrentdosfilmes2.site").replace(/\/$/, "");
const HOST_FRAGMENT = new URL(TDF_SITE_URL).hostname;

async function scrapePost(postUrl: string, imdb: string | undefined, signal: AbortSignal): Promise<TorrentResult | null> {
  try {
    const { html } = await flareGet(postUrl, signal);
    const magnets = extractMagnets(html);
    if (magnets.length === 0) return null;

    const pageTitle = extractPageTitle(html);
    const quality = extractQuality(pageTitle) ?? extractQuality(html);
    const audio = extractAudio(pageTitle).length > 0 ? extractAudio(pageTitle) : extractAudio(html);
    const size = extractSize(html);

    const results: TorrentResult[] = magnets.map((magnet) => ({
      title: `Torrent dos Filmes | ${pageTitle || "Conteúdo"}`,
      imdb,
      audio: audio.length > 0 ? audio : ["Português (Dublado)"],
      quality: quality ?? "HD",
      magnet,
      info_hash: extractInfoHash(magnet),
      size: size ?? undefined,
    }));

    return (
      results.find((r) => r.quality === "1080p") ??
      results.find((r) => r.quality === "720p") ??
      results[0] ??
      null
    );
  } catch {
    return null;
  }
}

export async function scrapeTorrentDosFilmes(req: IndexerRequest, signal: AbortSignal): Promise<IndexerResponse> {
  const searchQueries: string[] = [];
  if (req.imdb) {
    searchQueries.push(req.imdb);
    const meta = await resolveImdbTitle(req.imdb, signal);
    if (meta?.title) searchQueries.push(meta.title);
  } else if (req.q) {
    searchQueries.push(req.q);
  }

  if (searchQueries.length === 0) return { results: [], count: 0 };

  const limit = req.limit ?? 5;

  for (const query of searchQueries) {
    const searchUrl = buildSearchUrl(TDF_SITE_URL, query);
    try {
      const { html } = await flareGet(searchUrl, signal);
      const postLinks = extractLinks(html, HOST_FRAGMENT, limit * 2);
      if (postLinks.length > 0) {
        const scraped = await Promise.all(
          postLinks.slice(0, limit).map((url) => scrapePost(url, req.imdb, signal))
        );
        const results = scraped.filter((r): r is TorrentResult => r !== null);
        if (results.length > 0) {
          return { results, count: results.length };
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[torrentdosfilmes] FlareSolverr search failed for "${query}": ${msg}`);
    }
  }

  return { results: [], count: 0 };
}
