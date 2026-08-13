import { HttpDataClient } from "../clients/http/httpDataClient.js";
import { createDefaultBluDVProvider } from "../providers/bludv/bludvFactory.js";
import { createDefaultTorrentioProvider } from "../providers/torrentio/torrentioFactory.js";
import { InternetArchiveDataClient } from "../providers/internetArchive/internetArchiveDataClient.js";
import { InternetArchiveParser } from "../providers/internetArchive/internetArchiveParser.js";
import { InternetArchiveProvider } from "../providers/internetArchive/internetArchiveProvider.js";
import { MockProvider } from "../providers/mockProvider.js";
import { ProviderManager, type ProviderManagerOptions } from "../services/providerManager.js";
import { StreamService } from "../services/streamService.js";
import { loadEnvFile } from "../utils/env.js";

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

  return manager;
}

let defaultStreamServiceInstance: StreamService | undefined;

export function createDefaultStreamService(options?: ProviderManagerOptions): StreamService {
  return new StreamService(createDefaultProviderManager(options));
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
