import { getManifest } from "../addon/manifest.js";
import { toStremioStreams } from "../adapters/stremioStreamAdapter.js";
import { ProviderManager } from "./providerManager.js";
import { StreamCache } from "./streamCache.js";
import type { MediaType } from "../types/mediaType.js";
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

function toMediaType(type: string): MediaType {
  if (!isSupportedType(type)) {
    throw new StreamRequestError(`Unsupported type: ${type}`);
  }

  return type;
}

function toStreamQuery(type: string, id: string): StreamQuery {
  const mediaType = toMediaType(type);

  if (!matchesIdPrefix(id)) {
    throw new StreamRequestError(`Unsupported id prefix for id: ${id}`);
  }

  return { type: mediaType, id };
}

export class StreamService {
  private readonly cache: StreamCache<StremioStream[]> | undefined;

  constructor(
    private readonly providerManager: ProviderManager,
    cache?: StreamCache<StremioStream[]>,
  ) {
    this.cache = cache;
  }

  async getStreams(type: string, id: string): Promise<StremioStream[]> {
    const query = toStreamQuery(type, id);
    const key = `${query.type}:${query.id}`;

    const load = async (): Promise<StremioStream[]> => {
      const results = await this.providerManager.getStreamsFromAll(query);
      return toStremioStreams(results);
    };

    if (this.cache?.isEnabled) {
      return this.cache.getOrSet(key, () => load(), new AbortController().signal);
    }

    return load();
  }
}
