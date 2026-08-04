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
  authorizedCandidates?: readonly Readonly<{ readonly imdbId: string; readonly type: StreamQuery["type"] }>[];
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

const IMDB = /^tt\d{7,10}$/;
const FIXED_STREAM_TITLE = "Real-Debrid";

type AuthorizedCandidate = Readonly<{ readonly imdbId: string; readonly type: StreamQuery["type"] }>;

function singleAuthorizedCandidate(config: ExperimentalRealDebridAddonRuntimeConfig): AuthorizedCandidate | undefined {
  if (config.enabled !== true) return undefined;
  const candidates = config.authorizedCandidates;
  const allowed = config.authorizedImdbIds ?? [];
  if (candidates?.length !== 1
    || !IMDB.test(candidates[0]!.imdbId)
    || (candidates[0]!.type !== "movie" && candidates[0]!.type !== "series")
    || !allowed.includes(candidates[0]!.imdbId)) {
    throw new ExperimentalRealDebridAddonRuntimeError();
  }
  return Object.freeze({ imdbId: candidates[0]!.imdbId, type: candidates[0]!.type });
}

function authorizedProvider(provider: TorrentIndexerProvider, allowed: AuthorizedCandidate | undefined): StreamProvider {
  if (allowed === undefined) return Object.freeze({ id: provider.id, name: provider.name, getStreams: async () => [] });
  return Object.freeze({
    id: provider.id,
    name: provider.name,
    getStreams: async (query: StreamQuery, signal: AbortSignal): Promise<StreamResult[]> => {
      const imdb = /^tt\d{7,10}/.exec(query.id)?.[0];
      if (query.type !== allowed.type || imdb !== allowed.imdbId) return [];
      const streams = await provider.getStreams(query, signal);
      return streams.map((stream) => Object.freeze({ ...stream, title: FIXED_STREAM_TITLE }));
    },
  });
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
  return Object.freeze({ enabled: true, token: config.token, candidateLimit: 1 });
}

/**
 * Experimental, isolated composition for the runtime laboratory only.
 * It never mutates the application's default ProviderManager or performs I/O.
 */
export function createExperimentalRealDebridAddonRuntime(
  config: ExperimentalRealDebridAddonRuntimeConfig,
  dependencies: ExperimentalRealDebridAddonRuntimeDependencies,
): ExperimentalRealDebridAddonRuntime {
  const wiring = wiringConfig(config);
  const allowed = singleAuthorizedCandidate(config);
  const manager = (dependencies.createProviderManager ?? ((options) => new ProviderManager(options)))(config.providerManager);
  const provider = createRealDebridTorrentIndexerProvider(
    dependencies.client,
    dependencies.parser,
    config.source,
    wiring,
    dependencies.wiring,
  );
  const guardedProvider = authorizedProvider(provider, allowed);
  manager.register(guardedProvider);
  return Object.freeze({ provider: guardedProvider, providerManager: manager });
}
