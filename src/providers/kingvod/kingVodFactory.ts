import type { HttpDataClient } from "../../clients/http/httpDataClient.js";
import { KingVodClient } from "./kingVodClient.js";
import { KingVodProvider } from "./kingVodProvider.js";

export function createDefaultKingVodProvider(httpClient: HttpDataClient): KingVodProvider {
  const client = new KingVodClient(httpClient);
  return new KingVodProvider({ client });
}
