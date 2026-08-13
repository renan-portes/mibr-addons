import { HttpDataClient } from "../clients/http/httpDataClient.js";
import { createDefaultBluDVProvider } from "../providers/bludv/bludvFactory.js";
import { createDefaultTorrentioProvider } from "../providers/torrentio/torrentioFactory.js";
import { createDefaultTorrentDosFilmesProvider } from "../providers/torrentdosfilmes/torrentDosFilmesFactory.js";
import { InternetArchiveDataClient } from "../providers/internetArchive/internetArchiveDataClient.js";
import { InternetArchiveParser } from "../providers/internetArchive/internetArchiveParser.js";
import { InternetArchiveProvider } from "../providers/internetArchive/internetArchiveProvider.js";
import { MockProvider } from "../providers/mockProvider.js";
import { ProviderManager, type ProviderManagerOptions } from "../services/providerManager.js";
import { StreamCache } from "../services/streamCache.js";
import { StreamService } from "../services/streamService.js";
import { loadEnvFile } from "../utils/env.js";

function createDefaultStreamCache(): StreamCache<import("../types/stremio.js").StremioStream[]> {
  const ttlSeconds = Number(process.env.STREAM_CACHE_TTL_SECONDS ?? 300);
  const maxEntries = Number(process.env.STREAM_CACHE_MAX_ENTRIES ?? 500);

  return new StreamCache({
    ttlSeconds: Number.isFinite(ttlSeconds) && ttlSeconds >= 0 ? Math.trunc(ttlSeconds) : 300,
    maxEntries: Number.isFinite(maxEntries) && maxEntries > 0 ? Math.trunc(maxEntries) : 500,
  });
}

export function createDefaultProviderManager(options?: ProviderManagerOptions): ProviderManager {
  loadEnvFile();
  const manager = new ProviderManager(options);
  manager.register(new MockProvider());

  const httpClient = new HttpDataClient();
  const iaClient = new InternetArchiveDataClient(httpClient);
  const iaParser = new InternetArchiveParser();
  manager.register(new InternetArchiveProvider(iaClient, iaParser));

  manager.register(createDefaultBluDVProvider(httpClient));
  manager.register(createDefaultTorrentioProvider(httpClient));
  manager.register(createDefaultTorrentDosFilmesProvider(httpClient));

  return manager;
}

let defaultStreamServiceInstance: StreamService | undefined;

export function createDefaultStreamService(options?: ProviderManagerOptions): StreamService {
  return new StreamService(createDefaultProviderManager(options), createDefaultStreamCache());
}

export function getDefaultStreamService(): StreamService {
  if (!defaultStreamServiceInstance) {
    defaultStreamServiceInstance = createDefaultStreamService();
  }
  return defaultStreamServiceInstance;
}

export async function getStreams(type: string, id: string) {
  return getDefaultStreamService().getStreams(type, id);
}
