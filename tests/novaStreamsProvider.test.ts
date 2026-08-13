import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HttpDataClient } from "../src/clients/http/httpDataClient.js";
import { NovaStreamsClient } from "../src/providers/novaStreams/novaStreamsClient.js";
import { NovaStreamsParser } from "../src/providers/novaStreams/novaStreamsParser.js";
import { NovaStreamsProvider } from "../src/providers/novaStreams/novaStreamsProvider.js";

describe("NovaStreams Provider", () => {
  it("parses valid NovaStreams response", () => {
    const parser = new NovaStreamsParser();
    const result = parser.parse({
      streams: [
        {
          name: "Nova Streams [Original Audio]",
          title: "1080p FHD • 847 MB\nInception (2010)",
          url: "https://hcdn.hakunaymatata.com/test.mp4",
        },
      ],
    });

    assert.equal(result.length, 1);
    assert.equal(result[0].name, "Nova Streams [Original Audio]");
    assert.equal(result[0].url, "https://hcdn.hakunaymatata.com/test.mp4");
  });

  it("handles empty or invalid responses gracefully", () => {
    const parser = new NovaStreamsParser();
    assert.deepEqual(parser.parse({}), []);
    assert.deepEqual(parser.parse({ streams: [] }), []);
  });

  it("queries movie streams and maps items to StreamResult", async () => {
    const fakeClient = {
      async fetch() {
        return {
          streams: [
            {
              name: "Nova Streams [Original Audio]",
              title: "1080p FHD • 1.5 GB",
              url: "https://hcdn.hakunaymatata.com/movie.mp4",
            },
          ],
        };
      },
    } as unknown as NovaStreamsClient;

    const provider = new NovaStreamsProvider({
      client: fakeClient,
      parser: new NovaStreamsParser(),
    });

    const streams = await provider.getStreams({ type: "movie", id: "tt1375666" }, new AbortController().signal);
    assert.equal(streams.length, 1);
    assert.equal(streams[0].url, "https://hcdn.hakunaymatata.com/movie.mp4");
  });
});
