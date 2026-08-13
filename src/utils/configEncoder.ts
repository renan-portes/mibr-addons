import type { UserConfig } from "../types/userConfig.js";

/**
 * Encode a UserConfig object into a URL-safe Base64 string.
 */
export function encodeUserConfig(config: UserConfig): string {
  try {
    const json = JSON.stringify(config);
    const base64 = Buffer.from(json, "utf-8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    return base64;
  } catch {
    return "";
  }
}

/**
 * Decode a URL-safe Base64 string back into a UserConfig object.
 */
export function decodeUserConfig(encoded: string): UserConfig | null {
  if (!encoded || encoded.trim().length === 0) return null;

  try {
    let base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4 !== 0) {
      base64 += "=";
    }

    const json = Buffer.from(base64, "base64").toString("utf-8");
    const parsed = JSON.parse(json) as unknown;

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null;
    }

    const obj = parsed as Record<string, unknown>;
    const config: UserConfig = {};

    if (typeof obj.realDebridToken === "string" && obj.realDebridToken.trim().length > 0) {
      config.realDebridToken = obj.realDebridToken.trim();
    }

    if (Array.isArray(obj.providers)) {
      config.providers = obj.providers.filter((p): p is string => typeof p === "string");
    }

    if (Array.isArray(obj.resolutions)) {
      config.resolutions = obj.resolutions.filter((r): r is string => typeof r === "string");
    }

    if (obj.audioFilter === "all" || obj.audioFilter === "ptbr_only" || obj.audioFilter === "prefer_dual") {
      config.audioFilter = obj.audioFilter;
    }

    if (typeof obj.disableMocks === "boolean") {
      config.disableMocks = obj.disableMocks;
    }

    return config;
  } catch {
    return null;
  }
}
