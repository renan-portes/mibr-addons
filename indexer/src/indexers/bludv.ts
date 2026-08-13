/**
 * BluDV scraper — searches bludvfilmes.xyz (or configured alternative domain)
 * for Brazilian dubbed/dual-audio torrents by IMDb ID or title query.
 *
 * Strategy:
 * 1. GET the search results page via FlareSolverr
 * 2. Extract individual movie post URLs from results
 * 3. For each post URL, GET the page and extract magnet links + metadata
 * 4. Return structured results
 *
 * ENV:
 *   BLUDV_SITE_URL  — base URL of the BluDV site (default: https://bludvfilmes.xyz)
 */

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

const BLUDV_SITE_URL = (process.env.BLUDV_SITE_URL ?? "https://bludvfilmes.xyz").replace(/\/$/, "");
const HOST_FRAGMENT = new URL(BLUDV_SITE_URL).hostname;

/** Scrape a single movie post page and return a TorrentResult (or null on failure). */
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
      title: `BluDV | ${pageTitle || "Conteúdo"}`,
      imdb,
      audio: audio.length > 0 ? audio : ["Português"],
      quality: quality ?? "HD",
      magnet,
      info_hash: extractInfoHash(magnet),
      size: size ?? undefined,
    }));

    // Return the best result (prefer 1080p, then 720p, then any)
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

export async function scrapeBluDV(req: IndexerRequest, signal: AbortSignal): Promise<IndexerResponse> {
  const query = req.imdb ?? req.q;
  if (!query) return { results: [], count: 0 };

  const limit = req.limit ?? 5;
  const searchUrl = buildSearchUrl(BLUDV_SITE_URL, query);

  let searchHtml: string;
  try {
    const res = await flareGet(searchUrl, signal);
    searchHtml = res.html;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[bludv] FlareSolverr failed for search: ${msg}`);
    return { results: [], count: 0 };
  }

  // Extract post page links from search results
  const postLinks = extractLinks(searchHtml, HOST_FRAGMENT, limit * 2);
  if (postLinks.length === 0) {
    console.warn(`[bludv] No post links found for query: ${query}`);
    return { results: [], count: 0 };
  }

  // Scrape each post (cap to limit)
  const scraped = await Promise.all(
    postLinks.slice(0, limit).map((url) => scrapePost(url, req.imdb, signal))
  );

  const results = scraped.filter((r): r is TorrentResult => r !== null);
  return { results, count: results.length };
}
