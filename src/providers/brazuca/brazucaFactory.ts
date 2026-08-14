import type { HttpDataClient } from "../../clients/http/httpDataClient.js";
import { BrazucaClient } from "./brazucaClient.js";
import { BrazucaProvider } from "./brazucaProvider.js";

export function createDefaultBrazucaProvider(httpClient: HttpDataClient): BrazucaProvider {
  const client = new BrazucaClient(httpClient);
  return new BrazucaProvider({ client });
}
