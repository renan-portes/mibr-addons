import type { StremioStream, StremioType } from "../types/stremio.js";

export function getMockStreams(type: StremioType, id: string): StremioStream[] {
  return [
    {
      name: "MIBR Addons",
      title: `Mock 1080p (${type})`,
      url: `https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4#${id}`,
    },
    {
      name: "MIBR Addons",
      title: `Mock 720p (${type})`,
      url: `https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4#${id}`,
    },
  ];
}
