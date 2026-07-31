import { getManifest } from "../addon/manifest.js";
import { getMockStreams } from "../providers/mockStreams.js";
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

export function getStreams(type: string, id: string): StremioStream[] {
  if (!isSupportedType(type)) {
    throw new StreamRequestError(`Unsupported type: ${type}`);
  }

  if (!matchesIdPrefix(id)) {
    throw new StreamRequestError(`Unsupported id prefix for id: ${id}`);
  }

  return getMockStreams(type, id);
}
