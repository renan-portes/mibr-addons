export type AudioFilterMode = "all" | "ptbr_only" | "prefer_dual";

export type DebridProviderType =
  | "realdebrid"
  | "alldebrid"
  | "premiumize"
  | "debridlink"
  | "torbox"
  | "offcloud"
  | "putio"
  | "none";

export interface UserConfig {
  debridProvider?: DebridProviderType;
  debridToken?: string;
  realDebridToken?: string;
  providers?: string[];
  resolutions?: string[];
  audioFilter?: AudioFilterMode;
  disableMocks?: boolean;
}
