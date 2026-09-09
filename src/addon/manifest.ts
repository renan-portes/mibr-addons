import type { StremioManifest } from "../types/stremio.js";

export const manifest: StremioManifest = {
  id: "community.mibr.tv",
  name: "MIBR TV 🇧🇷",
  version: "1.0.0",
  description: "Canais de TV Ao Vivo do Brasil em HD/FHD (100% PT-BR) — Made in Brasil.",
  icon: "https://mibr.servidor.xyz.br/mibr-logo.png",
  logo: "https://mibr.servidor.xyz.br/mibr-logo.png",
  background: "https://mibr.servidor.xyz.br/mibr-logo.png",
  resources: ["catalog", "meta", "stream"],
  types: ["channel"],
  idPrefixes: ["mibr:tv:"],
  catalogs: [
    {
      type: "channel",
      id: "mibr-tv-canais",
      name: "🇧🇷 Canais de TV Ao Vivo",
      extra: [
        { name: "genre" },
        { name: "search" },
        { name: "skip" },
      ],
    },
  ],
};

export function getManifest(hostUrl?: string, genres?: string[]): StremioManifest {
  const cleanHost = hostUrl ? hostUrl.replace(/\/$/, "") : "";
  const base = {
    ...manifest,
    icon: cleanHost ? `${cleanHost}/mibr-logo.png` : manifest.icon,
    logo: cleanHost ? `${cleanHost}/mibr-logo.png` : manifest.logo,
    background: cleanHost ? `${cleanHost}/mibr-logo.png` : manifest.background,
  };

  if (genres && genres.length > 0) {
    base.catalogs = [
      {
        type: "channel",
        id: "mibr-tv-canais",
        name: "🇧🇷 Canais de TV Ao Vivo",
        extra: [
          { name: "genre", options: genres },
          { name: "search" },
          { name: "skip" },
        ],
      },
    ];
  }

  return base;
}
