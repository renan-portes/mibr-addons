import { FenixFlixClient, getDefaultFenixFlixClient } from "../providers/fenixflix/fenixflixClient.js";
import type { StremioCatalog, StremioManifest } from "../types/stremio.js";
import { type AddonConfig, DEFAULT_ADDON_CONFIG } from "./addonConfig.js";

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
  behaviorHints: {
    configurable: true,
    configurationRequired: false,
  },
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

export function getManifest(
  hostUrl?: string,
  genres?: string[],
  fenixflix: FenixFlixClient = getDefaultFenixFlixClient(),
  config: AddonConfig = DEFAULT_ADDON_CONFIG,
): StremioManifest {
  const cleanHost = hostUrl ? hostUrl.replace(/\/$/, "") : "";
  const fenixflixActive = fenixflix.isEnabled() && config.fenixEnabled;
  const activeGenres = genres
    ? genres.filter((g) => config.tvGenres.includes(g))
    : config.tvGenres;

  const catalogs: StremioCatalog[] = [];

  if (config.tvAll) {
    catalogs.push({
      type: "tv",
      id: "mibr-tv-canais",
      name: "⭐ Todos os Canais",
      extra: [
        { name: "genre", options: activeGenres.length > 0 ? activeGenres : undefined },
        { name: "search" },
        { name: "skip" },
      ],
    });
  }

  if (activeGenres.includes("Abertos")) {
    catalogs.push({
      type: "tv",
      id: "mibr-tv-abertos",
      name: "🇧🇷 TV Aberta",
      extra: [{ name: "search" }, { name: "skip" }],
    });
  }

  if (activeGenres.includes("Esportes")) {
    catalogs.push({
      type: "tv",
      id: "mibr-tv-esportes",
      name: "⚽ Esportes & Futebol",
      extra: [{ name: "search" }, { name: "skip" }],
    });
  }

  if (activeGenres.includes("Streaming")) {
    catalogs.push({
      type: "tv",
      id: "mibr-tv-streaming",
      name: "🎬 Streaming",
      extra: [{ name: "search" }, { name: "skip" }],
    });
  }

  if (activeGenres.includes("Filmes & Séries")) {
    catalogs.push({
      type: "tv",
      id: "mibr-tv-filmes",
      name: "🍿 Filmes & Séries",
      extra: [{ name: "search" }, { name: "skip" }],
    });
  }

  if (activeGenres.includes("Notícias")) {
    catalogs.push({
      type: "tv",
      id: "mibr-tv-noticias",
      name: "📰 Notícias",
      extra: [{ name: "search" }, { name: "skip" }],
    });
  }

  if (activeGenres.includes("Infantil")) {
    catalogs.push({
      type: "tv",
      id: "mibr-tv-infantil",
      name: "🧸 Infantil",
      extra: [{ name: "search" }, { name: "skip" }],
    });
  }

  if (activeGenres.includes("Documentários")) {
    catalogs.push({
      type: "tv",
      id: "mibr-tv-documentarios",
      name: "🌍 Documentários",
      extra: [{ name: "search" }, { name: "skip" }],
    });
  }

  if (activeGenres.includes("Entretenimento")) {
    catalogs.push({
      type: "tv",
      id: "mibr-tv-entretenimento",
      name: "🎭 Entretenimento",
      extra: [{ name: "search" }, { name: "skip" }],
    });
  }

  if (fenixflixActive) {
    catalogs.push(...fenixflix.getCatalogs(config.fenixCatalogs));
  }

  const types = fenixflixActive
    ? (["tv", "channel", "movie", "series"] as const)
    : (["tv", "channel"] as const);

  const idPrefixes = fenixflixActive
    ? ["mibr:tv:", "tt", "tmdb"]
    : ["mibr:tv:"];

  return {
    ...manifest,
    description: fenixflixActive
      ? "Canais de TV Ao Vivo, Filmes e Séries em HD/FHD (100% PT-BR) - Made in Brasil."
      : "Canais de TV Ao Vivo do Brasil em HD/FHD (100% PT-BR) - Made in Brasil.",
    types: [...types],
    idPrefixes,
    icon: cleanHost ? `${cleanHost}/mibr-logo.png` : manifest.icon,
    logo: cleanHost ? `${cleanHost}/mibr-logo.png` : manifest.logo,
    background: cleanHost ? `${cleanHost}/mibr-logo.png` : manifest.background,
    catalogs,
  };
}
