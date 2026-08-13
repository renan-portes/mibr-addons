import type { HttpDataClient } from "../../clients/http/httpDataClient.js";
import { createRealDebridTorrentioProvider } from "./realDebridTorrentioWiring.js";
import { TorrentioClient } from "./torrentioClient.js";
import { TorrentioParser } from "./torrentioParser.js";
import { TorrentioProvider } from "./torrentioProvider.js";

export function createDefaultTorrentioProvider(httpClient: HttpDataClient): TorrentioProvider {
  const torrentioBaseUrl = process.env.TORRENTIO_BASE_URL || "mock";
  const client = new TorrentioClient(httpClient, { baseUrl: torrentioBaseUrl });
  const parser = new TorrentioParser();
  const token = process.env.REALDEBRID_TOKEN || process.env.REAL_DEBRID_TOKEN;

  if (token && token.trim().length > 0) {
    return createRealDebridTorrentioProvider(client, parser, {
      enabled: true,
      token: token.trim(),
    });
  }

  return new TorrentioProvider({ client, parser });
}
