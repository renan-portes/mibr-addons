import type { StreamProvider, StreamQuery } from "../../types/streamProvider.js";
import type { StreamResult } from "../../types/streamResult.js";

export class VidKingProvider implements StreamProvider {
  readonly id = "vidking";
  readonly name = "VidKing 🎬";

  async getStreams(query: StreamQuery, _signal: AbortSignal): Promise<StreamResult[]> {
    if (query.type !== "movie" && query.type !== "series") {
      return [];
    }

    const parts = query.id.split(":");
    const imdbId = parts[0];

    if (!imdbId || !/^tt\d+$/.test(imdbId)) {
      return [];
    }

    let embedUrl: string;
    let label: string;

    if (query.type === "movie") {
      embedUrl = `https://vidking.net/embed/movie/${imdbId}`;
      label = "Player Web • 🎬 Filme (Dublado / Legendado)";
    } else {
      const season = parts[1] ?? "1";
      const episode = parts[2] ?? "1";
      embedUrl = `https://vidking.net/embed/tv/${imdbId}/${season}/${episode}`;
      label = `Player Web • 🎬 Temp ${season} Ep ${episode} (Dublado / Legendado)`;
    }

    return [
      {
        name: this.name,
        title: label,
        url: embedUrl,
      },
    ];
  }
}
