import type { HttpDataClient } from "../../clients/http/httpDataClient.js";
import { StremThruClient } from "./stremThruClient.js";
import { StremThruProvider } from "./stremThruProvider.js";

export function createDefaultStremThruProvider(httpClient: HttpDataClient): StremThruProvider {
  const client = new StremThruClient(httpClient);
  return new StremThruProvider({ client });
}
