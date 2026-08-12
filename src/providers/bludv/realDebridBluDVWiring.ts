import type { DataClient } from "../../types/dataClient.js";
import type { Parser } from "../../types/parser.js";
import { createRealDebridProviderWiring, type RealDebridProviderWiringConfig, type RealDebridProviderWiringDependencies } from "../torrentIndexer/realDebridProviderWiring.js";
import { BluDVProvider } from "./bludvProvider.js";
import type { BluDVRawResponse, BluDVRequest, BluDVResponse } from "./bludvTypes.js";

export function createRealDebridBluDVProvider(
  client: DataClient<BluDVRequest, BluDVRawResponse>,
  parser: Parser<BluDVRawResponse, BluDVResponse>,
  config: RealDebridProviderWiringConfig,
  dependencies: RealDebridProviderWiringDependencies = {},
): BluDVProvider {
  const wiring = createRealDebridProviderWiring(config, dependencies);
  return new BluDVProvider({
    client,
    parser,
    resolver: wiring.resolver,
  });
}
