import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MockProvider } from "../src/providers/mockProvider.js";
import { ProviderManager } from "../src/services/providerManager.js";
import { StreamService } from "../src/services/streamService.js";

describe("MockProvider", () => {
  it("returns two mock streams", async () => {
    const provider = new MockProvider();
    const streams = await provider.getStreams({ type: "movie", id: "tt1234567" });

    assert.equal(streams.length, 2);
    assert.match(streams[0]?.url ?? "", /tt1234567$/);
  });
});

describe("stream service", () => {
  it("returns streams from registered providers", async () => {
    const manager = new ProviderManager();
    manager.register(new MockProvider());
    const service = new StreamService(manager);

    const streams = await service.getStreams("movie", "tt1234567");

    assert.equal(streams.length, 2);
    assert.equal(streams[0]?.name, "MIBR Addons");
    assert.match(streams[1]?.title ?? "", /720p/);
  });

  it("returns streams for supported series ids", async () => {
    const manager = new ProviderManager();
    manager.register(new MockProvider());
    const service = new StreamService(manager);

    const streams = await service.getStreams("series", "tt7654321");

    assert.equal(streams.length, 2);
    assert.match(streams[0]?.title ?? "", /series/);
  });

  it("rejects unsupported types", async () => {
    const service = new StreamService(new ProviderManager());

    await assert.rejects(() => service.getStreams("anime", "tt1234567"), /Unsupported type/);
  });

  it("rejects ids without configured prefixes", async () => {
    const service = new StreamService(new ProviderManager());

    await assert.rejects(() => service.getStreams("movie", "imdb:123"), /Unsupported id prefix/);
  });

  it("continues when one provider fails", async () => {
    const manager = new ProviderManager();

    manager.register({
      id: "failing",
      name: "Failing Provider",
      async getStreams() {
        throw new Error("boom");
      },
    });
    manager.register(new MockProvider());

    const service = new StreamService(manager);
    const streams = await service.getStreams("movie", "tt1234567");

    assert.equal(streams.length, 2);
  });
});
