import type { HttpDataClient } from "../../clients/http/httpDataClient.js";
import { FenixFlixClient } from "./fenixFlixClient.js";
import { FenixFlixProvider } from "./fenixFlixProvider.js";

export function createDefaultFenixFlixProvider(httpClient: HttpDataClient): FenixFlixProvider {
  const client = new FenixFlixClient(httpClient);
  return new FenixFlixProvider({ client });
}
