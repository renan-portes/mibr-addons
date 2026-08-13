/**
 * TorrentDosFilmes Indexer — Scrapes torrentdosfilmes2.site
 */

import { flareGet } from "../flaresolverr.js";
import { resolveImdbTitle } from "../cinemeta.js";
import {
  extractAudio,
  extractInfoHash,
  extractLinks,
  extractMagnets,
  extractPageTitle,
  extractQuality,
  extractSize,
  resolveProtectorMagnets,
} from "../parsers.js";
import type { IndexerRequest, IndexerResponse, TorrentResult } from "../types.js";

const TDF_SITE_URL = process.env.TORRENTDOSFILMES_SITE_URL || "https://torrentdosfilmes2.site";
const HOST_FRAGMENT = "torrentdosfilmes2.site";

function buildSearchUrl(siteUrl: string, query: string): string {
  const url = new URL(siteUrl);
  url.searchParams.set("s", query);
  return url.toString();
}

async function scrapePost(postUrl: string, imdb: string | undefined, signal: AbortSignal): Promise<TorrentResult[]> {
  try {
    const { html } = await flareGet(postUrl, signal);
    const magnets = await resolveProtectorMagnets(html, signal);

    if (magnets.length === 0) return [];

    const pageTitle = extractPageTitle(html);
    const quality = extractQuality(pageTitle) ?? extractQuality(html);
    const audio = extractAudio(pageTitle).length > 0 ? extractAudio(pageTitle) : extractAudio(html);
    const size = extractSize(html);

    return magnets.map((magnet) => {
      const magQuality = extractQuality(magnet) ?? quality ?? "HD";
      return {
        title: `TDF | ${pageTitle || "Conteúdo"}`,
        imdb,
        audio: audio.length > 0 ? audio : ["Português (Dublado)"],
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

export async function scrapeTorrentDosFilmes(req: IndexerRequest, signal: AbortSignal): Promise<IndexerResponse> {
  const searchQueries: string[] = [];
  if (req.imdb) {
    const meta = await resolveImdbTitle(req.imdb, signal);
    if (meta?.title) {
      searchQueries.push(meta.title);
      const cleanTitle = meta.title.replace(/^(the|a|an|o|a|os|as)\s+/i, "");
      if (cleanTitle !== meta.title) searchQueries.push(cleanTitle);
    }
    if (meta?.originalTitle && meta.originalTitle !== meta.title) {
      searchQueries.push(meta.originalTitle);
      const cleanOriginal = meta.originalTitle.replace(/^(the|a|an)\s+/i, "");
      if (cleanOriginal !== meta.originalTitle) searchQueries.push(cleanOriginal);
    }
    searchQueries.push(req.imdb);
  } else if (req.q) {
    searchQueries.push(req.q);
  }

  if (searchQueries.length === 0) return { results: [], count: 0 };

  const limit = req.limit ?? 5;
  const allResults: TorrentResult[] = [];

  for (const query of searchQueries) {
    const searchUrl = buildSearchUrl(TDF_SITE_URL, query);
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
          break;
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[tdf] Search failed for "${query}": ${msg}`);
    }
  }

  const seenHashes = new Set<string>();
  const deduplicated = allResults.filter((r) => {
    if (r.info_hash && seenHashes.has(r.info_hash)) return false;
    if (r.info_hash) seenHashes.add(r.info_hash);
    return true;
  });

  return { results: deduplicated, count: deduplicated.length };
}
