import type { StremioManifest } from "../types/stremio.js";

export const manifest: StremioManifest = {
  id: "community.mibr.addons",
  name: "MIBR Addons 🇧🇷",
  version: "0.2.0",
  description: "Filmes e séries dublados em Português (PT-BR) — Made in Brasil.",
  icon: "https://mibr.servidor.xyz.br/mibr-logo.png",
  logo: "https://mibr.servidor.xyz.br/mibr-logo.png",
  resources: ["stream"],
  types: ["movie", "series"],
  idPrefixes: ["tt"],
};

export function getManifest(hostUrl?: string): StremioManifest {
  if (hostUrl) {
    const cleanHost = hostUrl.replace(/\/$/, "");
    return {
      ...manifest,
      icon: `${cleanHost}/mibr-logo.png`,
      logo: `${cleanHost}/mibr-logo.png`,
    };
  }
  return manifest;
}
