import type { MediaType } from "../../types/mediaType.js";

export interface HttpFixtureCandidate {
  type: MediaType;
  id: string;
  title: string;
  quality: string;
  language: string;
  url: string;
}
