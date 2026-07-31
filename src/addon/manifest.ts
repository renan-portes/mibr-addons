import type { StremioManifest } from "../types/stremio.js";

export const manifest: StremioManifest = {
  id: "community.mibr.addons",
  name: "MIBR Addons",
  version: "0.1.0",
  description: "Modular media addon with independent providers.",
  resources: ["stream"],
  types: ["movie", "series"],
  idPrefixes: ["tt"],
};

export function getManifest(): StremioManifest {
  return manifest;
}
