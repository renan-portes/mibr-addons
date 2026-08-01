import type { MediaType } from "../../types/mediaType.js";

export interface FixtureStreamCandidate {
  type: MediaType;
  id: string;
  title: string;
  quality: string;
  language: string;
  url: string;
}
