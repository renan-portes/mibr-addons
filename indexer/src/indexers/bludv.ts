/**
 * BluDV scraper — searches bludvfilmes.xyz for PT-BR torrents by IMDb ID or title query.
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

const BLUDV_SITE_URL = (process.env.BLUDV_SITE_URL ?? "https://bludvfilmes.xyz").replace(/\/$/, "");
const HOST_FRAGMENT = new URL(BLUDV_SITE_URL).hostname;

async function scrapePost(postUrl: string, imdb: string | undefined, signal: AbortSignal): Promise<TorrentResult[]> {
  try {
    const { html } = await flareGet(postUrl, signal);
    const magnets = extractMagnets(html);
    if (magnets.length === 0) return [];

    const pageTitle = extractPageTitle(html);
    const quality = extractQuality(pageTitle) ?? extractQuality(html);
    const audio = extractAudio(pageTitle).length > 0 ? extractAudio(pageTitle) : extractAudio(html);
    const size = extractSize(html);

    return magnets.map((magnet) => {
      const magQuality = extractQuality(magnet) ?? quality ?? "HD";
      return {
        title: `BluDV | ${pageTitle || "Conteúdo"}`,
        imdb,
        audio: audio.length > 0 ? audio : ["Português"],
        quality: magQuality,
        magnet,
        info_hash: extractInfoHash(magnet),
        size: size ?? undefined,
      };
    });
  } catch {
    return [];
  }
}

export async function scrapeBluDV(req: IndexerRequest, signal: AbortSignal): Promise<IndexerResponse> {
  const searchQueries: string[] = [];
  if (req.imdb) {
    const meta = await resolveImdbTitle(req.imdb, signal);
    if (meta?.title) {
      searchQueries.push(meta.title);
      // Clean title without common English prefixes for broader search matching
      const cleanTitle = meta.title.replace(/^(the|a|an)\s+/i, "");
      if (cleanTitle !== meta.title) searchQueries.push(cleanTitle);
    }
    searchQueries.push(req.imdb);
  } else if (req.q) {
    searchQueries.push(req.q);
  }

  if (searchQueries.length === 0) return { results: [], count: 0 };

  const limit = req.limit ?? 5;
  const allResults: TorrentResult[] = [];

  for (const query of searchQueries) {
    const searchUrl = buildSearchUrl(BLUDV_SITE_URL, query);
    try {
      const { html } = await flareGet(searchUrl, signal);
      const postLinks = extractLinks(html, HOST_FRAGMENT, limit);
      if (postLinks.length > 0) {
        const scrapedNested = await Promise.all(
          postLinks.map((url) => scrapePost(url, req.imdb, signal))
        );
        const results = scrapedNested.flat();
        if (results.length > 0) {
          allResults.push(...results);
          break; // Stop after first successful query match
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[bludv] Search failed for "${query}": ${msg}`);
    }
  }

  // Deduplicate by info_hash
  const seenHashes = new Set<string>();
  const deduplicated = allResults.filter((r) => {
    if (r.info_hash && seenHashes.has(r.info_hash)) return false;
    if (r.info_hash) seenHashes.add(r.info_hash);
    return true;
  });

  return { results: deduplicated, count: deduplicated.length };
}
