import type { HttpDataClient } from "../../clients/http/httpDataClient.js";
import { MicoLeaoClient } from "./micoleaoClient.js";
import { MicoLeaoParser } from "./micoleaoParser.js";
import { MicoLeaoProvider } from "./micoleaoProvider.js";
import { createRealDebridMicoLeaoProvider } from "./realDebridMicoLeaoWiring.js";

export function createDefaultMicoLeaoProvider(httpClient: HttpDataClient, overrideToken?: string): MicoLeaoProvider {
  const micoleaoBaseUrl = process.env.MICOLEAO_BASE_URL || process.env.INDEXER_BASE_URL || "http://mibr-indexer:7001";
  const micoleaoClient = new MicoLeaoClient(httpClient, { baseUrl: micoleaoBaseUrl });
  const micoleaoParser = new MicoLeaoParser();
  const token = overrideToken ?? process.env.REALDEBRID_TOKEN ?? process.env.REAL_DEBRID_TOKEN;

  if (token && token.trim().length > 0) {
    return createRealDebridMicoLeaoProvider(micoleaoClient, micoleaoParser, {
      enabled: true,
      token: token.trim(),
    });
  }

  return new MicoLeaoProvider({ client: micoleaoClient, parser: micoleaoParser });
}
