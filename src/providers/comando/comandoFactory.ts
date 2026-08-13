import type { HttpDataClient } from "../../clients/http/httpDataClient.js";
import { ComandoClient } from "./comandoClient.js";
import { ComandoParser } from "./comandoParser.js";
import { ComandoProvider } from "./comandoProvider.js";
import { createRealDebridComandoProvider } from "./realDebridComandoWiring.js";

export function createDefaultComandoProvider(httpClient: HttpDataClient): ComandoProvider {
  const comandoBaseUrl = process.env.COMANDO_BASE_URL || process.env.INDEXER_BASE_URL || "http://mibr-indexer:7001";
  const comandoClient = new ComandoClient(httpClient, { baseUrl: comandoBaseUrl });
  const comandoParser = new ComandoParser();
  const token = process.env.REALDEBRID_TOKEN || process.env.REAL_DEBRID_TOKEN;

  if (token && token.trim().length > 0) {
    return createRealDebridComandoProvider(comandoClient, comandoParser, {
      enabled: true,
      token: token.trim(),
    });
  }

  return new ComandoProvider({ client: comandoClient, parser: comandoParser });
}
