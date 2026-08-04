import type { DataClient } from "../types/dataClient.js";
import type { Parser } from "../types/parser.js";
import { ProviderManager, type ProviderManagerOptions } from "../services/providerManager.js";
import {
  createRealDebridTorrentIndexerProvider,
  type RealDebridProviderWiringConfig,
  type RealDebridProviderWiringDependencies,
} from "../providers/torrentIndexer/realDebridProviderWiring.js";
import type {
  TorrentIndexerRawResponse,
  TorrentIndexerRequest,
  TorrentIndexerResponse,
  TorrentIndexerSource,
} from "../providers/torrentIndexer/torrentIndexerTypes.js";
import type { TorrentIndexerProvider } from "../providers/torrentIndexer/torrentIndexerProvider.js";
import type { StreamProvider, StreamQuery } from "../types/streamProvider.js";
import type { StreamResult } from "../types/streamResult.js";

export type ExperimentalRealDebridAddonRuntimeConfig = Readonly<{
  enabled: boolean;
  token?: string;
  authorizedImdbIds?: readonly string[];
  source: TorrentIndexerSource;
  providerManager?: ProviderManagerOptions;
}>;

export type ExperimentalRealDebridAddonRuntimeDependencies = Readonly<{
  client: DataClient<TorrentIndexerRequest, TorrentIndexerRawResponse>;
  parser: Parser<TorrentIndexerRawResponse, TorrentIndexerResponse>;
  wiring?: RealDebridProviderWiringDependencies;
  createProviderManager?: (options: ProviderManagerOptions | undefined) => ProviderManager;
}>;

export interface ExperimentalRealDebridAddonRuntime {
  readonly provider: StreamProvider;
  readonly providerManager: ProviderManager;
}

function authorizedProvider(provider: TorrentIndexerProvider, allowed: readonly string[] | undefined): StreamProvider {
  const ids = new Set(allowed ?? []);
  if (ids.size === 0) return Object.freeze({ id: provider.id, name: provider.name, getStreams: async () => [] });
  return Object.freeze({ id: provider.id, name: provider.name, getStreams: (query: StreamQuery, signal: AbortSignal): Promise<StreamResult[]> => ids.has(query.id) ? provider.getStreams(query, signal) : Promise.resolve([]) });
}

export class ExperimentalRealDebridAddonRuntimeError extends Error {
  constructor() {
    super("Experimental Real-Debrid addon runtime rejected (invalid_configuration)");
    this.name = "ExperimentalRealDebridAddonRuntimeError";
  }
}

function wiringConfig(config: ExperimentalRealDebridAddonRuntimeConfig): RealDebridProviderWiringConfig {
  if (config.enabled === false) return Object.freeze({ enabled: false });
  if (config.enabled !== true || typeof config.token !== "string" || config.token.trim().length === 0) {
    throw new ExperimentalRealDebridAddonRuntimeError();
  }
  return Object.freeze({ enabled: true, token: config.token });
}

/**
 * Experimental, isolated composition for the runtime laboratory only.
 * It never mutates the application's default ProviderManager or performs I/O.
 */
export function createExperimentalRealDebridAddonRuntime(
  config: ExperimentalRealDebridAddonRuntimeConfig,
  dependencies: ExperimentalRealDebridAddonRuntimeDependencies,
): ExperimentalRealDebridAddonRuntime {
  const manager = (dependencies.createProviderManager ?? ((options) => new ProviderManager(options)))(config.providerManager);
  const provider = createRealDebridTorrentIndexerProvider(
    dependencies.client,
    dependencies.parser,
    config.source,
    wiringConfig(config),
    dependencies.wiring,
  );
  const guardedProvider = authorizedProvider(provider, config.enabled === true ? config.authorizedImdbIds : undefined);
  manager.register(guardedProvider);
  return Object.freeze({ provider: guardedProvider, providerManager: manager });
}
