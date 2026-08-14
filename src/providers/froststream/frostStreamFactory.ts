import type { HttpDataClient } from "../../clients/http/httpDataClient.js";
import { FrostStreamClient } from "./frostStreamClient.js";
import { FrostStreamProvider } from "./frostStreamProvider.js";

export function createDefaultFrostStreamProvider(httpClient: HttpDataClient): FrostStreamProvider {
  const client = new FrostStreamClient(httpClient);
  return new FrostStreamProvider({ client });
}
