export interface AddonConfig {
  tvGenres: string[];
  tvAll: boolean;
  fenixEnabled: boolean;
  fenixQualities: string[];
  fenixAudio: string[];
  fenixCatalogs: string[];
}

export const DEFAULT_TV_GENRES = [
  "Abertos",
  "Esportes",
  "Streaming",
  "Filmes & Séries",
  "Notícias",
  "Infantil",
  "Documentários",
  "Entretenimento",
] as const;

export const DEFAULT_FENIX_QUALITIES = ["4k", "1080p", "720p", "sd"] as const;
export const ALL_FENIX_QUALITIES = ["4k", "1080p", "720p", "sd", "cam"] as const;

export const DEFAULT_FENIX_AUDIO = ["dublado", "legendado"] as const;

export const DEFAULT_FENIX_CATALOGS = [
  "populares_movie",
  "populares_series",
  "recentes_movie",
  "recentes_series",
] as const;

export const DEFAULT_ADDON_CONFIG: AddonConfig = {
  tvGenres: [...DEFAULT_TV_GENRES],
  tvAll: true,
  fenixEnabled: true,
  fenixQualities: [...DEFAULT_FENIX_QUALITIES],
  fenixAudio: [...DEFAULT_FENIX_AUDIO],
  fenixCatalogs: [...DEFAULT_FENIX_CATALOGS],
};

/**
 * Parses a config string from the URL path.
 * Format: key=val|key2=val2 (supports pipe | or %7C)
 */
export function parseAddonConfig(rawConfig?: string): AddonConfig {
  if (!rawConfig || typeof rawConfig !== "string" || rawConfig.trim() === "") {
    return {
      tvGenres: [...DEFAULT_ADDON_CONFIG.tvGenres],
      tvAll: DEFAULT_ADDON_CONFIG.tvAll,
      fenixEnabled: DEFAULT_ADDON_CONFIG.fenixEnabled,
      fenixQualities: [...DEFAULT_ADDON_CONFIG.fenixQualities],
      fenixAudio: [...DEFAULT_ADDON_CONFIG.fenixAudio],
      fenixCatalogs: [...DEFAULT_ADDON_CONFIG.fenixCatalogs],
    };
  }

  const decoded = decodeURIComponent(rawConfig).trim();
  const parts = decoded.split(/[|]/);

  const config: AddonConfig = {
    tvGenres: [...DEFAULT_TV_GENRES],
    tvAll: true,
    fenixEnabled: true,
    fenixQualities: [...DEFAULT_FENIX_QUALITIES],
    fenixAudio: [...DEFAULT_FENIX_AUDIO],
    fenixCatalogs: [...DEFAULT_FENIX_CATALOGS],
  };

  for (const part of parts) {
    const eqIdx = part.indexOf("=");
    if (eqIdx === -1) continue;
    const key = part.slice(0, eqIdx).trim().toLowerCase();
    const val = part.slice(eqIdx + 1).trim();

    if (key === "tv_genres") {
      if (val === "" || val === "none") {
        config.tvGenres = [];
      } else {
        const parsedGenres = val.split(",").map((g) => g.trim()).filter(Boolean);
        config.tvGenres = DEFAULT_TV_GENRES.filter((stdGenre) =>
          parsedGenres.some((p) => p.toLowerCase() === stdGenre.toLowerCase()),
        );
      }
    } else if (key === "tv_all") {
      config.tvAll = val === "true" || val === "1";
    } else if (key === "fenix_enabled") {
      config.fenixEnabled = val === "true" || val === "1";
    } else if (key === "fenix_qualities" || key === "qualities") {
      config.fenixQualities = val
        .split(",")
        .map((q) => q.trim().toLowerCase())
        .filter((q) => ALL_FENIX_QUALITIES.includes(q as any));
    } else if (key === "fenix_audio" || key === "audio") {
      config.fenixAudio = val
        .split(",")
        .map((a) => a.trim().toLowerCase())
        .filter((a) => DEFAULT_FENIX_AUDIO.includes(a as any));
    } else if (key === "fenix_catalogs" || key === "catalogs") {
      config.fenixCatalogs = val
        .split(",")
        .map((c) => c.trim().toLowerCase())
        .filter((c) => DEFAULT_FENIX_CATALOGS.includes(c as any));
    }
  }

  return config;
}

/**
 * Serializes an AddonConfig into a pipe-delimited string.
 */
export function serializeAddonConfig(config: Partial<AddonConfig>): string {
  const parts: string[] = [];

  if (config.tvGenres !== undefined) {
    parts.push(`tv_genres=${config.tvGenres.join(",")}`);
  }
  if (config.tvAll !== undefined) {
    parts.push(`tv_all=${config.tvAll ? "true" : "false"}`);
  }
  if (config.fenixEnabled !== undefined) {
    parts.push(`fenix_enabled=${config.fenixEnabled ? "true" : "false"}`);
  }

  if (config.fenixEnabled !== false) {
    if (config.fenixQualities && config.fenixQualities.length > 0) {
      parts.push(`fenix_qualities=${config.fenixQualities.join(",")}`);
    }
    if (config.fenixAudio && config.fenixAudio.length > 0) {
      parts.push(`fenix_audio=${config.fenixAudio.join(",")}`);
    }
    if (config.fenixCatalogs && config.fenixCatalogs.length > 0) {
      parts.push(`fenix_catalogs=${config.fenixCatalogs.join(",")}`);
    }
  }

  return parts.join("|");
}

/**
 * Generates the upstream FenixFlix configuration string to forward in the URL path.
 * e.g.: qualities=4k,1080p,720p,sd|audio=dublado,legendado|catalogs=populares_movie,populares_series,recentes_movie,recentes_series
 */
export function toFenixFlixUpstreamConfig(config: AddonConfig): string {
  if (!config.fenixEnabled) return "";

  const parts: string[] = [];
  if (config.fenixQualities && config.fenixQualities.length > 0) {
    parts.push(`qualities=${config.fenixQualities.join(",")}`);
  }
  if (config.fenixAudio && config.fenixAudio.length > 0) {
    parts.push(`audio=${config.fenixAudio.join(",")}`);
  }
  if (config.fenixCatalogs && config.fenixCatalogs.length > 0) {
    parts.push(`catalogs=${config.fenixCatalogs.join(",")}`);
  }

  return parts.join("|");
}
