import type { StreamProvider, StreamQuery } from "../types/streamProvider.js";
import type { StremioStream } from "../types/stremio.js";

export class MockProvider implements StreamProvider {
  readonly id = "mock";
  readonly name = "MIBR Addons";

  async getStreams(query: StreamQuery): Promise<StremioStream[]> {
    return [
      {
        name: this.name,
        title: `Mock 1080p (${query.type})`,
        url: `https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4#${query.id}`,
      },
      {
        name: this.name,
        title: `Mock 720p (${query.type})`,
        url: `https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4#${query.id}`,
      },
    ];
  }
}
