import type { HttpDataClient } from "../../clients/http/httpDataClient.js";
import { TorrinClient } from "./torrinClient.js";
import { TorrinProvider } from "./torrinProvider.js";

export function createDefaultTorrinProvider(httpClient: HttpDataClient): TorrinProvider {
  const client = new TorrinClient(httpClient);
  return new TorrinProvider({ client });
}
