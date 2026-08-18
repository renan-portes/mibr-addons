import type { HttpDataClient } from "../../clients/http/httpDataClient.js";
import { FrostViewClient } from "./frostViewClient.js";
import { FrostViewProvider } from "./frostViewProvider.js";

export function createDefaultFrostViewProvider(httpClient: HttpDataClient): FrostViewProvider {
  const client = new FrostViewClient(httpClient);
  return new FrostViewProvider({ client });
}
