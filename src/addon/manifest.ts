import type { StremioManifest } from "../types/stremio.js";

export const manifest: StremioManifest = {
  id: "community.mibr.addons",
  name: "MIBR Addons 🇧🇷",
  version: "0.3.0",
  description: "Filmes, séries e TV ao vivo dublados em Português (PT-BR) — Made in Brasil.",
  icon: "https://mibr.servidor.xyz.br/mibr-logo.png",
  logo: "https://mibr.servidor.xyz.br/mibr-logo.png",
  resources: ["stream", "catalog", "meta"],
  types: ["movie", "series", "channel"],
  idPrefixes: ["tt", "cs:channel:"],
  catalogs: [
    {
      type: "channel",
      id: "froststream-channels",
      name: "🇧🇷 Canais de TV Ao Vivo",
      extra: [
        { name: "genre" },
        { name: "search" },
        { name: "skip" }
      ]
    }
  ]
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
