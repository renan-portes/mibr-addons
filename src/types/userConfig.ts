export type AudioFilterMode = "all" | "ptbr_only" | "prefer_dual";

export interface UserConfig {
  debridService?: "realdebrid" | "none";
  realDebridToken?: string;
  providers?: string[];
  resolutions?: string[];
  audioFilter?: AudioFilterMode;
  disableMocks?: boolean;
}
