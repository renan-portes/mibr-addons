import type { StremioManifest } from "../../types/stremio.js";

const experimentalManifest: Readonly<StremioManifest> = Object.freeze({
  id: "community.mibr.experimental.runtime",
  name: "MIBR Experimental Runtime",
  version: "0.0.1",
  description: "Offline experimental addon runtime laboratory.",
  resources: ["stream"] as StremioManifest["resources"],
  types: ["movie", "series"] as StremioManifest["types"],
  idPrefixes: ["tt"],
});

export function getExperimentalAddonManifest(): StremioManifest {
  return structuredClone(experimentalManifest);
}
