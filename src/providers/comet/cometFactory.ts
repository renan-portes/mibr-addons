import type { HttpDataClient } from "../../clients/http/httpDataClient.js";
import { CometClient } from "./cometClient.js";
import { CometProvider } from "./cometProvider.js";

export function createDefaultCometProvider(httpClient: HttpDataClient): CometProvider {
  const client = new CometClient(httpClient);
  return new CometProvider({ client });
}
