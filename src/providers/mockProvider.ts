import type { StreamProvider, StreamQuery } from "../types/streamProvider.js";
import type { StreamResult } from "../types/streamResult.js";

export class MockProvider implements StreamProvider {
  readonly id = "mock";
  readonly name = "MIBR Addons";

  async getStreams(query: StreamQuery, _signal: AbortSignal): Promise<StreamResult[]> {
    return [
      {
        name: this.name,
        title: `Mock 1080p (${query.type})`,
        url: "https://vjs.zencdn.net/v/oceans.mp4",
      },
      {
        name: this.name,
        title: `Mock 720p (${query.type})`,
        url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
      },
    ];
  }
}
