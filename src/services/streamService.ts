import { getManifest } from "../addon/manifest.js";
import { MockProvider } from "../providers/mockProvider.js";
import { ProviderManager } from "./providerManager.js";
import type { StreamQuery } from "../types/streamProvider.js";
import type { StremioStream, StremioType } from "../types/stremio.js";

const SUPPORTED_TYPES = new Set<StremioType>(getManifest().types);

export class StreamRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StreamRequestError";
  }
}

function isSupportedType(type: string): type is StremioType {
  return SUPPORTED_TYPES.has(type as StremioType);
}

function matchesIdPrefix(id: string): boolean {
  return getManifest().idPrefixes.some((prefix) => id.startsWith(prefix));
}

function toStreamQuery(type: string, id: string): StreamQuery {
  if (!isSupportedType(type)) {
    throw new StreamRequestError(`Unsupported type: ${type}`);
  }

  if (!matchesIdPrefix(id)) {
    throw new StreamRequestError(`Unsupported id prefix for id: ${id}`);
  }

  return { type, id };
}

export function createDefaultProviderManager(): ProviderManager {
  const manager = new ProviderManager();
  manager.register(new MockProvider());
  return manager;
}

export class StreamService {
  constructor(private readonly providerManager: ProviderManager) {}

  async getStreams(type: string, id: string): Promise<StremioStream[]> {
    const query = toStreamQuery(type, id);
    return this.providerManager.getStreamsFromAll(query);
  }
}

const defaultStreamService = new StreamService(createDefaultProviderManager());

export function getDefaultStreamService(): StreamService {
  return defaultStreamService;
}

export async function getStreams(type: string, id: string): Promise<StremioStream[]> {
  return defaultStreamService.getStreams(type, id);
}
