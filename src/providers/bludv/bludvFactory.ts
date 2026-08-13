import type { HttpDataClient } from "../../clients/http/httpDataClient.js";
import { BluDVClient } from "./bludvClient.js";
import { BluDVParser } from "./bludvParser.js";
import { BluDVProvider } from "./bludvProvider.js";
import { createRealDebridBluDVProvider } from "./realDebridBluDVWiring.js";

export function createDefaultBluDVProvider(httpClient: HttpDataClient): BluDVProvider {
  const bludvBaseUrl = process.env.BLUDV_BASE_URL || "http://mibr-indexer:7001";
  const bludvClient = new BluDVClient(httpClient, { baseUrl: bludvBaseUrl });
  const bludvParser = new BluDVParser();
  const token = process.env.REALDEBRID_TOKEN || process.env.REAL_DEBRID_TOKEN;

  if (token && token.trim().length > 0) {
    return createRealDebridBluDVProvider(bludvClient, bludvParser, {
      enabled: true,
      token: token.trim(),
    });
  }

  return new BluDVProvider({ client: bludvClient, parser: bludvParser });
}
