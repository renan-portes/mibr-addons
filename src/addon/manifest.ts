import type { StremioCatalog, StremioManifest } from "../types/stremio.js";

export const manifest: StremioManifest = {
  id: "community.mibr.tv",
  name: "MIBR TV",
  version: "1.0.0",
  description: "Canais de TV Ao Vivo do Brasil em HD/FHD (100% PT-BR) - Made in Brasil.",
  icon: "https://mibr.servidor.xyz.br/mibr-logo.png",
  logo: "https://mibr.servidor.xyz.br/mibr-logo.png",
  background: "https://mibr.servidor.xyz.br/mibr-logo.png",
  resources: ["catalog", "meta", "stream"],
  types: ["tv", "channel"],
  idPrefixes: ["mibr:tv:"],
  catalogs: [
    {
      type: "tv",
      id: "mibr-tv-canais",
      name: "📺 Canais de TV Ao Vivo",
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
  const catalogs: StremioCatalog[] = [
    {
      type: "tv",
      id: "mibr-tv-canais",
      name: "⭐ Todos os Canais",
      extra: [
        { name: "genre", options: genres && genres.length > 0 ? genres : undefined },
        { name: "search" },
        { name: "skip" },
      ],
    },
  ];

  if (genres?.includes("Abertos")) {
    catalogs.push({
      type: "tv",
      id: "mibr-tv-abertos",
      name: "🇧🇷 TV Aberta",
      extra: [{ name: "search" }, { name: "skip" }],
    });
  }

  if (genres?.includes("Esportes")) {
    catalogs.push({
      type: "tv",
      id: "mibr-tv-esportes",
      name: "⚽ Esportes & Futebol",
      extra: [{ name: "search" }, { name: "skip" }],
    });
  }

  if (genres?.includes("Streaming")) {
    catalogs.push({
      type: "tv",
      id: "mibr-tv-streaming",
      name: "🎬 Streaming",
      extra: [{ name: "search" }, { name: "skip" }],
    });
  }

  if (genres?.includes("Filmes & Séries")) {
    catalogs.push({
      type: "tv",
      id: "mibr-tv-filmes",
      name: "🍿 Filmes & Séries",
      extra: [{ name: "search" }, { name: "skip" }],
    });
  }

  if (genres?.includes("Notícias")) {
    catalogs.push({
      type: "tv",
      id: "mibr-tv-noticias",
      name: "📰 Notícias",
      extra: [{ name: "search" }, { name: "skip" }],
    });
  }

  if (genres?.includes("Infantil")) {
    catalogs.push({
      type: "tv",
      id: "mibr-tv-infantil",
      name: "🧸 Infantil",
      extra: [{ name: "search" }, { name: "skip" }],
    });
  }

  if (genres?.includes("Documentários")) {
    catalogs.push({
      type: "tv",
      id: "mibr-tv-documentarios",
      name: "🌍 Documentários",
      extra: [{ name: "search" }, { name: "skip" }],
    });
  }

  if (genres?.includes("Entretenimento")) {
    catalogs.push({
      type: "tv",
      id: "mibr-tv-entretenimento",
      name: "🎭 Entretenimento",
      extra: [{ name: "search" }, { name: "skip" }],
    });
  }

  return {
    ...manifest,
    icon: cleanHost ? `${cleanHost}/mibr-logo.png` : manifest.icon,
    logo: cleanHost ? `${cleanHost}/mibr-logo.png` : manifest.logo,
    background: cleanHost ? `${cleanHost}/mibr-logo.png` : manifest.background,
    catalogs,
  };
}
