import type { HttpDataClient } from "../../clients/http/httpDataClient.js";
import { createRealDebridTorrentDosFilmesProvider } from "./realDebridTorrentDosFilmesWiring.js";
import { TorrentDosFilmesClient } from "./torrentDosFilmesClient.js";
import { TorrentDosFilmesParser } from "./torrentDosFilmesParser.js";
import { TorrentDosFilmesProvider } from "./torrentDosFilmesProvider.js";

export function createDefaultTorrentDosFilmesProvider(httpClient: HttpDataClient): TorrentDosFilmesProvider {
  const baseUrl = process.env.TORRENTDOSFILMES_BASE_URL || "http://mibr-indexer:7001";
  const client = new TorrentDosFilmesClient(httpClient, { baseUrl });
  const parser = new TorrentDosFilmesParser();
  const token = process.env.REALDEBRID_TOKEN || process.env.REAL_DEBRID_TOKEN;

  if (token && token.trim().length > 0) {
    return createRealDebridTorrentDosFilmesProvider(client, parser, {
      enabled: true,
      token: token.trim(),
    });
  }

  return new TorrentDosFilmesProvider({ client, parser });
}
